import { NextPage } from 'next'
import Link from 'next/Link'
import Head from 'next/head'
import styles from '../../styles/Home.module.css'

interface Props {
  postId: string
}
const PostPage:NextPage<Props> = (props) => {
  const {postId} = props

  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to PostPage
        </h1>

        <p className={styles.description}>
          postId: {postId}
        </p>

        <div>
          <Link href="/">/index</Link>
          <br/>
          <Link href="/p-get-initial-props">/p-get-initial-props</Link>
          <br/>
          <Link href="/p-get-server-side-props">/p-get-server-side-props</Link>
          <br/>
          <Link href="/p-get-static-props">/p-get-static-props</Link>
          <br/>
          <Link href="/p-without-any">/p-without-any</Link>
          <br/>
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <img src="/vercel.svg" alt="Vercel Logo" className={styles.logo} />
        </a>
      </footer>
    </div>
  )
}

PostPage.getInitialProps = async (ctx) => {
  const {postId} = ctx.query

  return { postId: Array.isArray(postId) ? postId[0] : postId }
}

export default PostPage
