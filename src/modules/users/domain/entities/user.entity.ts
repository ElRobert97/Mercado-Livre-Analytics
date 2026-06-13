export class UserEntity {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(id: string, name: string, email: string, passwordHash: string): UserEntity {
    return new UserEntity(
      id,
      name,
      email,
      passwordHash,
      new Date(),
      new Date()
    );
  }
}
