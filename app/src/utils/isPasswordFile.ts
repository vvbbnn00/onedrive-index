export function isPasswordFile(name: unknown): boolean {
  return typeof name === 'string' && name.toLowerCase() === '.password'
}
