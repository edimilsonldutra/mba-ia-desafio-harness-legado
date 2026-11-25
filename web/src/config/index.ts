// Único ponto do front que lê import.meta.env (G5). Cada cópia do Balcão sobe o front
// com VITE_API_URL apontando para a própria API.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
