import * as path from 'path'
import * as fs from 'fs'
import rimraf from "rimraf"
import execa from "execa"
import { Builder } from '@sls-next/lambda-at-edge'
import regexEscape from 'regex-escape'
import archiver from 'archiver';
import { glob } from '@vercel/build-utils';

const getAllFilesInDirectory = async (basePath: string) => {
  const fsRefs = await glob('**', { cwd: basePath })
  return Object.keys(fsRefs)
}

export async function generateZipBundle(filesNames: string[], outputPath: string) {
  return new Promise<string>((resolve) => {
    const output = fs.createWriteStream(outputPath);
    output.on('close', () => resolve(outputPath));

    const archive = archiver('zip', {
      zlib: { level: 5 },
    });
    archive.pipe(output);

    for (const file of filesNames) {
      archive.append('', { name: file });
    }

    archive.finalize();
  });
}

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

const getDynamicRoutesDestQS = (routesKeyValues: Record<string,string>) => {
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
  console.log('===================== start next build')

  rimraf.sync('build')
  console.log("deleted 'build' directory.")
  fs.mkdirSync('build')
  console.log("created 'build' directory.")

  await builder.build(true)

  ///////////////////////////////////////////////////////
  // proxy-config.json
  const alm = require('../.serverless_nextjs/api-lambda/manifest.json')
  const dlm = require('../.serverless_nextjs/default-lambda/manifest.json')
  const dlpm = require('../.serverless_nextjs/default-lambda/prerender-manifest.json')
  const dlrm = require('../.serverless_nextjs/default-lambda/routes-manifest.json')
  const dlpmRoutesKeys = Object.keys(dlpm.routes)

  const dynamicRoutes = dlrm.dynamicRoutes.map((r: any) => ({
    src: r.namedRegex,
    dest: `${r.page}?${getDynamicRoutesDestQS(r.routeKeys)}`,
    check: true,
  }))

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

    ...dynamicRoutes,

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

  fs.writeFileSync('build/proxy-config.json', JSON.stringify(proxyConfig,null,2))
  console.log('===================== created build/proxy-config.json file.\n')

  ///////////////////////////////////////////////////////
  // now__launcher.js
  const dynamicRoutesSrcDest = dynamicRoutes.map((r:any) => ({ src: r.src, dest: r.dest }))
  const apiRequireCodes = Object.keys(alm.apis.nonDynamic).map(key => (
      `  '${key}': () => require('./.next/serverless/${alm.apis.nonDynamic[key]}'),`
    )).join('\n')

  const nonDynamicPageRequireCodes = Object.keys(dlm.pages.ssr.nonDynamic)
    .filter(key => key !== '/_error')
    .map(key => (
      `  '${key}': () => require('./.next/serverless/${dlm.pages.ssr.nonDynamic[key]}'),`
    )).join('\n')

  const dynamicPageRequireCodes = dlrm.dynamicRoutes.map((r: any) => (
      `  '${r.page}': () => require('./.next/serverless/${r.page}.js'),`
    )).join('\n')

  if (apiLength > 0) {
    const apiBuildInfoTs = `
// This file is generated at build time. Don't modify manually.
export const dynamicRoutes = ${JSON.stringify(dynamicRoutesSrcDest,null,2)}
export const buildId = "${dlm.buildId}"
export const escapedBuildId = "${regexEscape(dlm.buildId)}"
export const pages = {
${apiRequireCodes}
}`.trim()

    const buildDir = 'build/__NEXT_API_LAMBDA_0'
    const r1 = await execa('cp', ['-rv','.serverless_nextjs/api-lambda',buildDir])
    console.log(r1.stdout)

    fs.writeFileSync(`${buildDir}/build-info.ts`, apiBuildInfoTs)
    fs.copyFileSync('cicd-tool/launcher.ts',`${buildDir}/launcher.ts`)
    fs.copyFileSync('cicd-tool/bridge.ts',`${buildDir}/bridge.ts`)

    // remove index.js for lambda@edge and make new index.js for lambda using launcher.ts
    fs.unlinkSync(`${buildDir}/index.js`)
    const {stdout} = await execa('npx', ['ncc','build',`${buildDir}/launcher.ts`,`-o`,`${buildDir}/`])
    console.log(stdout)

    fs.unlinkSync(`${buildDir}/launcher.ts`)
    fs.unlinkSync(`${buildDir}/bridge.ts`)
    fs.unlinkSync(`${buildDir}/build-info.ts`)

    // get bundle
    const filePaths = await getAllFilesInDirectory(path.join(process.cwd(), buildDir))
    console.log(filePaths)
    await generateZipBundle(filePaths, `${buildDir}.zip`)

    console.log(`===================== '${buildDir}.zip' is ready\n`)
  }

  if (pageLength > 0) {
    const pageBuildInfoTs = `
// This file is generated at build time. Don't modify manually.
export const dynamicRoutes = ${JSON.stringify(dynamicRoutesSrcDest,null,2)}
export const buildId = "${dlm.buildId}"
export const escapedBuildId = "${regexEscape(dlm.buildId)}"
export const pages = {
${nonDynamicPageRequireCodes}
${dynamicPageRequireCodes}
}`.trim()

    const buildDir = 'build/__NEXT_PAGE_LAMBDA_0'
    const r1 = await execa('cp', ['-rv','.serverless_nextjs/default-lambda',buildDir])
    console.log(r1.stdout)

    fs.writeFileSync(`${buildDir}/build-info.ts`, pageBuildInfoTs)
    fs.copyFileSync('cicd-tool/launcher.ts',`${buildDir}/launcher.ts`)
    fs.copyFileSync('cicd-tool/bridge.ts',`${buildDir}/bridge.ts`)

    // remove index.js for lambda@edge and make new index.js for lambda using launcher.ts
    fs.unlinkSync(`${buildDir}/index.js`)
    const {stdout} = await execa('npx', ['ncc','build',`${buildDir}/launcher.ts`,`-o`,`${buildDir}/`])
    console.log(stdout)

    fs.unlinkSync(`${buildDir}/launcher.ts`)
    fs.unlinkSync(`${buildDir}/bridge.ts`)
    fs.unlinkSync(`${buildDir}/build-info.ts`)

    // get bundle
    const filePaths = await getAllFilesInDirectory(path.join(process.cwd(), buildDir))
    console.log(filePaths)
    await generateZipBundle(filePaths, `${buildDir}.zip`)

    console.log(`===================== '${buildDir}.zip' is ready\n`)
  }

  console.log('===================== All done\n')
}

if (require.main === module) {
  run()
}
