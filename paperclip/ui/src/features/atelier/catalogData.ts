type CatalogDocument = {
  items?: unknown[]
  materials?: unknown[]
  style_presets?: unknown[]
}

async function loadCatalog(path: string): Promise<CatalogDocument> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Unable to load catalog ${path} (${response.status})`)
  }
  return (await response.json()) as CatalogDocument
}

export const [pbrCatalogData, japandiCatalogData, classicCatalogData] = await Promise.all([
  loadCatalog('/assets/pbr/pbr_catalog.json'),
  loadCatalog('/assets/sh3d-japandi/catalog.json'),
  loadCatalog('/assets/sh3d-classic/catalog.json'),
])
