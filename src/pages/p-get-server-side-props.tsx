import Link from 'next/Link'
import Head from 'next/head'
import styles from '../styles/Home.module.css'
import { GetServerSideProps } from 'next'

export default function PageWithGetStaticProps() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>

        <p className={styles.description}>
          This is p-get-server-side-props.tsx
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

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  console.log('in getServerSideProps')
  return {props: { hello: 'from-get-server-side-props'}}
}
