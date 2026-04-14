import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  transform: {
    column: postgres.toCamel,
  },
})

export default sql
