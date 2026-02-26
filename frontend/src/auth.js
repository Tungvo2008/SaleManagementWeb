import { get, post } from "./api"

export async function me() {
  return get("/api/v1/auth/me")
}

export async function login({ username, password }) {
  return post("/api/v1/auth/login", { username, password })
}

export async function logout() {
  return post("/api/v1/auth/logout", {})
}

