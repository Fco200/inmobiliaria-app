'use strict';

// Caché en memoria ligera para el frontend. Evita repetir peticiones de datos
// que no cambian cada segundo (catálogos, listados generales, configuraciones)
// y así reduce la carga del backend cuando hay muchos usuarios simultáneos.
//
// Uso:
//   const data = await AppCache.wrap('users:list', 120000, () => API.users.list());
//   AppCache.invalidate('users');       // borra todas las claves que empiezan con "users"
//   AppCache.clear();                    // limpia toda la caché
window.AppCache = (() => {
  // Map<clave, { value, expires, promise }>. Se guarda la promesa en vuelo para
  // que varias pantallas que piden lo mismo al mismo tiempo compartan UNA sola
  // petición (deduplicación), no una por llamador.
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expires && entry.expires < Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value, ttlMs) {
    store.set(key, {
      value,
      expires: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : 0,
      promise: null,
    });
    return value;
  }

  // Devuelve el valor cacheado si sigue vigente; si no, ejecuta `factory`
  // (una función que devuelve una promesa), guarda el resultado y lo retorna.
  // Si varias llamadas coinciden mientras la promesa está en vuelo, todas
  // reciben la MISMA promesa (una única petición HTTP).
  async function wrap(key, ttlMs, factory) {
    const cached = get(key);
    if (cached !== undefined) return cached;

    const inFlight = store.get(key);
    if (inFlight && inFlight.promise) return inFlight.promise;

    const promise = Promise.resolve()
      .then(factory)
      .then((value) => {
        set(key, value, ttlMs);
        return value;
      })
      .catch((error) => {
        // Un error no se cachea: la próxima llamada reintenta.
        store.delete(key);
        throw error;
      });

    store.set(key, { value: undefined, expires: 0, promise });
    return promise;
  }

  function invalidate(prefix) {
    if (!prefix) return clear();
    for (const key of Array.from(store.keys())) {
      if (key === prefix || key.startsWith(`${prefix}:`)) store.delete(key);
    }
  }

  function clear() {
    store.clear();
  }

  return { get, set, wrap, invalidate, clear };
})();

// Debounce compartido: retrasa la ejecución hasta que pasen `wait` ms sin
// nuevas llamadas. Útil para inputs de búsqueda y filtros que disparan fetch.
window.debounce = function debounce(fn, wait = 300) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
};
