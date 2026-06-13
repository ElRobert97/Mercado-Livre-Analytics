import { userRepository } from "../../infrastructure/repositories/postgres-user.repository";
import { User } from "../../../../shared/types";
import { RegisterRequestDto, UserResponseDto } from "../dto/user.dto";

export class AuthService {
  async register(dto: RegisterRequestDto): Promise<UserResponseDto> {
    const existingUser = await userRepository.findUserByEmail(dto.email);
    if (existingUser) {
      throw new Error("Email já cadastrado.");
    }

    const newUser: User = {
      id: `user_${Date.now()}`,
      name: dto.name,
      email: dto.email,
      password_hash: dto.password_hash,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await userRepository.createUser(newUser);
    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email
    };
  }

  async login(email: string, passwordHash: string): Promise<UserResponseDto> {
    const user = await userRepository.findUserByEmail(email);
    if (!user || user.password_hash !== passwordHash) {
      throw new Error("Email ou senha incorretos.");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email
    };
  }

  async findUserById(id: string): Promise<UserResponseDto | null> {
    const user = await userRepository.findUserById(id);
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email
    };
  }
}

export const authService = new AuthService();
