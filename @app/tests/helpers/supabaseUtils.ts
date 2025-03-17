import { createClient } from '@supabase/supabase-js'
import { Pool, PoolClient } from 'pg'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
const databaseUrl = process.env.DATABASE_URL

export const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
export const serviceClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })

let pool: Pool
let client: PoolClient | null = null

export const initDB = async (): Promise<PoolClient> => {
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl })
  }
  if (!client) {
    client = await pool.connect()
  }
  return client
}

export const closeDB = async () => {
  try {
    if (client) await client.release()
  } catch (error) {
    console.error('Error releasing DB client:', error)
  } finally {
    if (pool) await pool.end()
  }
}
