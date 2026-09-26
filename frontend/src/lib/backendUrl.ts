// Sin esto, si VITE_BACKEND_URL se carga con una barra final (algo fácil de
// tipear sin querer en las variables de entorno de Vercel), cada pedido
// arma "https://host//ruta" — Express no la reconoce y responde 404 con
// HTML en vez de JSON, que el frontend no puede parsear: termina
// mostrando "no se pudo conectar con el servidor" aunque el backend esté
// bien despierto y funcionando.
export const backendUrl = import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
