import {} from 'typescript'

const result = typescript.createIncrementalProgram({
  rootNames: ['src/main.tsx'],
  options: {
    tsconfig: 'tsconfig.json',
  },
})

const diagnostics = typescript.getSemanticDiagnostics(result)
// ... or just use tsc directly