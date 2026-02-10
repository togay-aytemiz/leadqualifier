import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    test: {
        environment: 'node',
        exclude: [...configDefaults.exclude, 'tests/e2e/**']
    },
    resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } }
})
