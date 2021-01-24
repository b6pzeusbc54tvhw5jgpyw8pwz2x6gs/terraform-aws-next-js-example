import * as path from 'path'
import { Builder } from '@sls-next/lambda-at-edge'

// The builder wraps nextJS in Compatibility layers for Lambda@Edge; handles the page
// manifest and creating the default-lambda and api-lambda. The final output is an assets
// folder which can be uploaded to s3 on every deploy.
const nextConfigDir = '.';
const outputDir = path.join(nextConfigDir, ".serverless_nextjs");

const options = {
  cmd: './node_modules/.bin/next',
  cwd: path.join(process.cwd(), nextConfigDir),
  args: ['build']
}

const builder = new Builder(
  nextConfigDir,
  outputDir,
  options,
);

const getDynamicRoutesDeskQS = (routesKeyValues: Record<string,string>) => {
  // arr = ['postId=$postId', 'type=$type']
  const arr = Object.keys(routesKeyValues).reduce((prev, current) => {
    return [...prev, `${current}=$${routesKeyValues[current]}`]
  }, [])
  return arr.join('&')
}

const replaceToEscape = (str: string) => {
  return str.replace(/-/g,'\\-')
    .replace(/\[/g,'\\[')
    .replace(/\]/g,'\\]')
}

const run = async () => {
  console.log('start next build')
  await builder.build(true)

  const alm = require('../.serverless_nextjs/api-lambda/manifest.json')
  const dlm = require('../.serverless_nextjs/default-lambda/manifest.json')
  const dlpm = require('../.serverless_nextjs/default-lambda/prerender-manifest.json')
  const dlrm = require('../.serverless_nextjs/default-lambda/routes-manifest.json')
  const dlpmRoutesKeys = Object.keys(dlpm.routes)

  const routes = [
    {
      // remove trailing slash
      "src": "^(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))\\/$",
      "headers": { "Location": "/$1" },
      "status": 308,
      "continue": true
    },

    { handle: 'filesystem' },

    ...Object.keys(alm.apis.nonDynamic).map(key => ({
      src: `^${key}/?$`,
      dest: '__NEXT_API_LAMBDA_0',
      headers: {
        'x-nextjs-page': key,
      },
      check: true,
    })),

    ...Object.keys(dlm.pages.ssr.nonDynamic).filter(key => {
      return key !== '/_error' && !dlpmRoutesKeys.includes(key)
    }).map(key => ({
      src: `^${key.replace(/-/g,'\\-')}/?$`,
      dest: '__NEXT_PAGE_LAMBDA_0',
      headers: {
        'x-nextjs-page': key,
      },
      check: true,
    })),

    // { handle: 'resource' },           // it is not used by proxy
    // { "src": "/.*", "status": 404 },  // maybe it should be moved to down
    // { "handle": "miss" },             // it is not used by proxy
    // { "handle": "rewrite" },          // it is not used by proxy

    ...dlrm.dataRoutes.filter((v: any) => {
      return !dlpmRoutesKeys.includes(v.page)
    }).map((r: any) => ({
      src: r.dataRouteRegex.replace(/\\-/g,'-').replace(/-/g,'\\-'), // TODO: check `-` escape 하는게 맞는지...!
      dest: r.page,
      check: true,
    })),

    ...dlpmRoutesKeys.map(key => ({
      src: `^${key.replace(/-/g,'\\-')}/?$`,
      dest: `/__NEXT_PAGE_LAMBDA_0`,
      headers: {
        'x-nextjs-page': key,
      },
      check: true,
    })),

    ...dlrm.dynamicRoutes.map((r: any) => ({
      src: r.namedRegex,
      dest: `${r.page}?${getDynamicRoutesDeskQS(r.routeKeys)}`,
      check: true,
    })),

    ...dlrm.dynamicRoutes.map((r: any) => ({
      src: `^${replaceToEscape(r.page)}/?$`,
      dest: `/__NEXT_PAGE_LAMBDA_0`,
      headers: {
        "x-nextjs-page": r.page,
      },
      check: true,
    })),

    { "handle": "hit" },
    { "handle": "error" },
    { "src": "/.*", "dest": "/404", "status": 404 },
  ]

  const staticRoutes = [
    ...Object.values(dlm.pages.html.nonDynamic)
      .map((v: string) => v.replace(/^pages/, ''))
      .map((v: string) => v.replace(/\.html$/, ''))
    ,
    ...Object.keys(dlm.publicFiles),
  ]

  const prerenders = {
    ...Object.keys(dlpm.routes).reduce((prev,key) => {
      const r = dlpm.routes[key]
      return {
        ...prev,
        [r.dataRoute]: { lambda: '__NEXT_PAGE_LAMBDA_0' },
        [key]: { lambda: '__NEXT_PAGE_LAMBDA_0' },
      }
    }, {})
  }

  const apiLength = Object.keys(alm.apis.dynamic).length + Object.keys(alm.apis.nonDynamic).length
  const pageLength = Object.keys(dlm.pages.ssr.dynamic).length + Object.keys(dlm.pages.ssr.nonDynamic).length
  const lambdaRoutes = [
    apiLength > 0 && "/__NEXT_API_LAMBDA_0",
    pageLength > 0 && "/__NEXT_PAGE_LAMBDA_0",
  ].filter(Boolean)

  const proxyConfig = { buildId: dlm.buildId, lambdaRoutes, prerenders, routes, staticRoutes }
  console.log(JSON.stringify(proxyConfig,null,2))
  console.log('--------- All done')
}

if (require.main === module) {
  run()
}
