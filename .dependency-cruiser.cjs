module.exports = {
  forbidden: [
    {
      name: 'no-cross-context-domain-imports',
      comment: 'A context consumes another context through that context public index only.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/(?!\\1(?:/|$))[^/]+/(?:domain|infrastructure)(?:/|$)' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: false,
    reporterOptions: { dot: { theme: { graph: { splines: 'ortho' } } } }
  }
};
