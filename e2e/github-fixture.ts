export function githubFixture(repository = 'Owner/Repo', isPublic = true, description = 'A useful project', dark = false) {
  return `<!doctype html><html lang="en"><head><meta name="octolytics-dimension-repository_nwo" content="${repository}"><meta name="octolytics-dimension-repository_public" content="${isPublic}"><style>body{background:${dark?'#0d1117':'#fff'};color:${dark?'#f0f6fc':'#1f2328'};font:14px system-ui}.pagehead-actions{display:flex;gap:8px;list-style:none;justify-content:flex-end}.btn{font:500 12px/20px system-ui;color:inherit;background:${dark?'#212830':'#f6f8fa'};border:1px solid ${dark?'#3d444d':'#d1d9e0'};border-radius:6px;padding:3px 12px;cursor:pointer}.btn:disabled{opacity:.6}.btn:hover{filter:brightness(.95)}</style></head><body><h1>${repository}</h1><ul class="pagehead-actions"><li><button class="btn btn-sm" onclick="document.body.dataset.starClicked='true'">Star</button></li></ul><p class="SidebarAbout-module__description__test">${description}</p><a href="/Other/Project">Other project</a></body></html>`;
}

/** Current signed-in header: no public metadata, semantic labels and generated layout classes. */
export function githubHeaderFixture(repository = 'Owner/Repo', visibility = 'Public', metadata = true) {
  const html = githubFixture(repository).replace(/<meta name="octolytics-dimension-repository_public"[^>]*>/, '');
  return (metadata ? html : html.replace(/<meta name="octolytics-dimension-repository_nwo"[^>]*>/, ''))
    .replace(`<h1>${repository}</h1>`, `<div><div itemprop="name"><strong><a data-testid="repo-name-link" href="/${repository}">${repository.split('/')[1]}</a></strong></div><span class="generated-label" data-testid="repo-visibility-label" data-component="Label">${visibility}</span></div>`)
    .replace(/<ul class="pagehead-actions">.*?<\/ul>/, `<ul class="generated-actions" style="display:flex;gap:8px;list-style:none"><li><button class="btn btn-sm" aria-label="Watch: Participating in ${repository}">Watch</button></li><li><a class="btn btn-sm" href="/${repository}/fork">Fork</a></li><li><button class="btn btn-sm" aria-label="Star ${repository}">Star</button></li></ul>`);
}
