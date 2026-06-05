# 🏆 Porra Mundial 2026

Dashboard para porra de Mundial entre compañeros. 100% estático, datos en GitHub, visible desde cualquier dispositivo via Vercel.

## Sistema de puntos

| Categoría | Puntos |
|---|---|
| 16 equipos a cuartos (por acierto) | 10 pts |
| 4 equipos a semifinales (por acierto) | 50 pts |
| 2 equipos a la final (por acierto) | 25 pts |
| Campeón | 50 pts |
| Subcampeón | 25 pts |
| Máximo goleador | 25 pts |
| MVP del Mundial | 25 pts |

## Estructura del repo

```
/
├── index.html   ← toda la web en un archivo
├── data.json    ← generado automáticamente por el admin
└── README.md
```

## Despliegue en Vercel

1. Crea un repo en GitHub y sube `index.html` + `README.md`
2. En vercel.com → New Project → importa el repo
3. Framework: **Other** · Build command: vacío · Output: raíz → Deploy

## Configuración inicial (solo una vez)

### 1. Personal Access Token de GitHub
`GitHub → Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate new token`
- Permisos necesarios: ✅ **repo** (completo)
- Cópialo — solo se muestra una vez

### 2. Primera vez en el Admin
1. Abre la web en Vercel → pestaña **Admin** → contraseña `porra2026`
2. En "Conexión GitHub" rellena:
   - **Usuario**: tu usuario de GitHub
   - **Repo**: nombre del repo (ej. `porra-mundial-2026`)
   - **Token**: el token copiado antes
3. Clic en **Guardar config** → **Probar conexión**

### 3. Añadir participantes
Cada vez que un compañero quiera apuntar sus picks:
1. Admin → Nuevo participante → rellenar todos los campos
2. **Guardar y bloquear picks** → confirmar x2
3. Se hace commit automático a `data.json` → Vercel redespliega en ~10s
4. Todos los visitantes ven los datos actualizados al entrar (o cada 60s)

## Flujo de datos

```
Admin guarda → GitHub commit (data.json) → Vercel rebuild
Visitante abre → fetch raw.githubusercontent.com/data.json → renderiza
```

El token **nunca sale de tu navegador** — se guarda en localStorage, no en el repo.
