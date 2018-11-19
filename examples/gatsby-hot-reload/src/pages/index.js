import React from 'react'

import Layout from '../components/layout'

const IndexPage = () => (
  <Layout>
    <h1 style={{color: '#000000'}}>Hot reload demo</h1>
    <p>We're using <a href="https://docs.garden.io/using-garden/hot-reload">Garden's hot reload</a> functionality in combination with <a href="https://github.com/gatsbyjs/gatsby">Gatsby</a> (running inside a container) to live-update this page.</p>
  </Layout>
)

export default IndexPage
