// The Next.js builder can emit the project in a subdirectory depending on how
// many folder levels of `node_modules` are traced. To ensure `process.cwd()`
// returns the proper path, we change the directory to the folder with the
// launcher. This mimics `yarn workspace run` behavior.
process.chdir(__dirname);

import { RequestListener, Server } from 'http';
import { Bridge } from './bridge';
import url from 'url'
// eslint-disable-next-line


// https://github.com/dealmore/vercel/blob/master/packages/now-next/src/index.ts#L1515
// delete some i18n codes

function stripLocalePath(pathname: string) { return pathname }

const pageHandler: RequestListener = function(req, res) {
  console.log('------------- I got request:')
  console.log('req.url: ' + req.url)
  console.log('req.headers[x-nextjs-page]: ' + req.headers['x-nextjs-page'])

  try {
    // TODO: create new file
    const pages = {
      '/p-get-initial-props': () => require('./pages/p-get-initial-props.js'),
      '/p-get-server-side-props': () => require('./pages/p-get-server-side-props.js'),
      '/p-get-static-props': () => require('./pages/p-get-static-props.js')
    }

    let toRender = req.headers['x-nextjs-page']
    if (Array.isArray(toRender)) return res.end('x-nextjs-page must be string')

    if (!toRender) {
      try {
        const { pathname } = url.parse(req.url)
        toRender = stripLocalePath(pathname).replace(/\/$/, '') || '/index'
      } catch (_) {
        // handle failing to parse url
        res.statusCode = 400
        return res.end('Bad Request')
      }
    }

    let currentPage = pages[toRender]
    if ( toRender && !currentPage) {
      if (toRender.includes('/_next/data')) {
        toRender = toRender
          .replace(new RegExp('/_next/data/${escapedBuildId}/'), '/')
          .replace(/\\.json$/, '')
        toRender = stripLocalePath(toRender) || '/index'
        currentPage = pages[toRender]
      }
      if (!currentPage) {
        // for prerendered dynamic routes (/blog/post-1) we need to
        // find the match since it won't match the page directly

        // TODO: create new file for dynamicRoutes
        const dynamicRoutes = []
        /*
        const dynamicRoutes = ${JSON.stringify(
          completeDynamicRoutes.map(route => ({
            src: route.src,
            dest: route.dest,
          }))
        )}
        */

        for (const route of dynamicRoutes) {
          const matcher = new RegExp(route.src)
          if (matcher.test(toRender)) {
            toRender = url.parse(route.dest).pathname
            currentPage = pages[toRender]
            break
          }
        }
      }
    }
    if (!currentPage) {
      console.error(
        "Failed to find matching page for", {toRender, header: req.headers['x-nextjs-page'], url: req.url }, "in lambda"
      )
      console.error('pages in lambda', Object.keys(pages))
      res.statusCode = 500
      return res.end('internal server error')
    }
    const mod = currentPage()
    const method = mod.render || mod.default || mod
    return method(req, res)
  } catch (err) {
    console.error('Unhandled error during request:', err)
    throw err
  }
}



// page.render is for React rendering
// page.default is for /api rendering
// page is for module.exports in /api
const server = new Server(pageHandler);
const bridge = new Bridge(server);
bridge.listen();

exports.launcher = bridge.launcher;
