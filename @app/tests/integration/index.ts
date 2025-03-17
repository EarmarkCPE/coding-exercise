import { PoolClient } from 'pg'
import { anonClient, closeDB, initDB, serviceClient } from '../helpers/supabaseUtils'
import { UserService } from '../helpers/users'

const TEST_EMAIL_DOMAIN = '@example.com'
let userService: UserService
let client: PoolClient
const mockUserDataEmail = [`user${TEST_EMAIL_DOMAIN}`, `admin${TEST_EMAIL_DOMAIN}`, `test${TEST_EMAIL_DOMAIN}`]

const seedDatabase = async (userArray) => {
  for (const userEmail of userArray) {
    try {
      const userId = await userService.getUserIdByEmail(userEmail)
      if (!userId) {
        await userService.register(userEmail, 'asdfasdf')
      }
      await userService.confirmUserEmail(userEmail)
    } catch (error) {
      console.error(`Failed to ensure user ${userEmail}:`, error)
      throw error
    }
  }
}

const cleanDB = async () => {
  const usersToDelete = await client.query(`select id from auth.users where email like '%${TEST_EMAIL_DOMAIN}'`)
  const userIds = usersToDelete.rows.map((u) => u.id)
  await client.query(`delete from public.users where auth_user_id = ANY($1)`, [userIds])
  await client.query(`delete from auth.users where id = ANY($1)`, [userIds])
}

beforeAll(async () => {
  client = await initDB()
  if (!client) throw new Error('Failed to initialize database client')

  userService = new UserService(anonClient, serviceClient, client)
  await seedDatabase(mockUserDataEmail)
})

describe('users', () => {
  it('users can only view their own data', async () => {
    const userEmail = `user${TEST_EMAIL_DOMAIN}`
    const testUserEmail = `test${TEST_EMAIL_DOMAIN}`

    const userId = await userService.getUserIdByEmail(userEmail)
    const testUserId = await userService.getUserIdByEmail(testUserEmail)
    if (!userId || !testUserId) throw new Error(`User not found`)

    expect(userId).not.toBe(testUserId)

    const [userClient, loggedInUserId] = await userService.login('user')

    let { data, error } = await userClient.from('users').select('*').eq('auth_user_id', loggedInUserId)
    expect(error).toBeNull()
    expect(data.every((user: any) => user.auth_user_id === loggedInUserId)).toBeTruthy()

    let { data: otherData, error: otherError } = await userClient
      .from('users')
      .select('*')
      .eq('auth_user_id', testUserId)

    expect(otherError).toBeNull()
    expect(otherData.length).toBe(0)
  })

  it('should allow super admins to view all users', async () => {
    const [dbResult, supabaseResult] = await Promise.all([
      client.query('SELECT * FROM users'),
      serviceClient.from('users').select('*')
    ])

    expect(supabaseResult.error).toBeNull()
    expect(supabaseResult.data.length).toBe(dbResult.rows.length)
  })
})

describe('registration', () => {
  it('can self register', async () => {
    const client = await initDB()
    const email = `test${TEST_EMAIL_DOMAIN}`
    let userId = await userService.getUserIdByEmail(email)

    if (!userId) {
      await userService.register(email, 'asdfasdf')
      userId = await userService.getUserIdByEmail(email)
    }

    expect(userId).not.toBeNull()

    const { rows: userProfiles } = await client.query('SELECT * FROM public.users WHERE auth_user_id = $1', [userId])
    expect(userProfiles.length).toBe(1)
    expect(userProfiles[0].auth_user_id).toBe(userId)
  })
})

afterAll(async () => {
  await cleanDB()
  await closeDB()
})
