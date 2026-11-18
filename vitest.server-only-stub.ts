// Empty stand-in for the `server-only` package, used only by the
// test runner (see vitest.config.mts).
//
// `server-only` throws when it is imported outside a React Server
// Component. That guard is real in the app build (Turbopack fails
// the build if a client component pulls in a server-only module),
// but it has no meaning in vitest: tests run in Node, and server
// actions are imported by client components, so a server action
// that uses a server-only module (e.g. blank-templates.server.ts)
// would break every test that renders the form. The build remains
// the guard; this stub only lets the tests load the modules.
export {};
