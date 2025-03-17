import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { PoolClient, Pool } from 'pg'

const TEST_EMAIL_DOMAIN = '@example.com'
const DEFAULT_TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'asdfasdf'

export class UserService {
  public anonClient: SupabaseClient
  public serviceClient: SupabaseClient
  public client: PoolClient

  constructor(anonClient: SupabaseClient, serviceClient: SupabaseClient, client: PoolClient) {
    if (!client) throw new Error('Database client is undefined')
    this.anonClient = anonClient
    this.serviceClient = serviceClient
    this.client = client
    Object.defineProperty(this, 'client', { value: client, writable: false })
  }

  async getUserIdByEmail(email: string): Promise<string | null> {
    if (!this.client) throw new Error('Database client is not initialized')

    try {
      const { rows } = await this.client.query('SELECT id FROM auth.users WHERE email = $1', [email])
      return rows.length ? rows[0].id : null
    } catch (error) {
      console.error(`Error fetching user by email: ${email}`, error)
      throw error
    }
  }

  async confirmUserEmail(email: string): Promise<void> {
    if (!this.client) throw new Error('Database client is not initialized')

    await this.client.query('UPDATE auth.users SET email_confirmed_at = now() WHERE email = $1', [email])
    const { rows } = await this.client.query('SELECT email_confirmed_at FROM auth.users WHERE email = $1', [email])
    if (!rows[0]?.email_confirmed_at) {
      throw new Error(`Email confirmation failed for ${email}`)
    }
  }

  async register(email: string, password: string = DEFAULT_TEST_PASSWORD): Promise<void> {
    const { data, error } = await this.anonClient.auth.signUp({ email, password })
    if (error) throw error

    const { error: confirmError } = await this.serviceClient.auth.admin.updateUserById(data.user.id, {
      email_confirm: true
    })
    if (confirmError) throw confirmError
  }

  async login(user: 'user' | 'admin'): Promise<[SupabaseClient, string]> {
    const email = `${user}${TEST_EMAIL_DOMAIN}`
    await this.confirmUserEmail(email)

    const {
      data: { session },
      error
    } = await this.anonClient.auth.signInWithPassword({
      email,
      password: DEFAULT_TEST_PASSWORD
    })

    if (error) throw error

    const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false }
    })

    return [userClient, session.user.id]
  }
}
