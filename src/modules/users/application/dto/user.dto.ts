export interface UserResponseDto {
  id: string;
  name: string;
  email: string;
}

export interface RegisterRequestDto {
  name: string;
  email: string;
  password_hash: string;
}

export interface LoginRequestDto {
  email: string;
  password_hash: string;
}
