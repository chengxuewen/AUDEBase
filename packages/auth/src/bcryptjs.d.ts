declare module 'bcryptjs' {
  export function hash(plain: string, cost: number): Promise<string>
  export function hashSync(plain: string, cost: number): string
  export function compare(plain: string, hash: string): Promise<boolean>
  export function compareSync(plain: string, hash: string): boolean
  export function genSalt(cost: number): Promise<string>
  export function genSaltSync(cost: number): string
}
