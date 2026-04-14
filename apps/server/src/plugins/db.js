import fp from 'fastify-plugin'
import sql from '../db/index.js'

export default fp(async (fastify) => {
  fastify.decorate('sql', sql)

  fastify.addHook('onClose', async () => {
    await sql.end()
  })
})
