// src/services/amaranteMapService.js — Cartografia OSM de Amarante (Equipamentos Urbanos, Ruas & ImmoEval)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AmaranteMap');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_OSM_PATH = path.resolve(__dirname, '../../data/maps/amarante.osm');

class AmaranteMapService {
  constructor(osmPath = DEFAULT_OSM_PATH) {
    this.osmPath = osmPath;
    this.isLoaded = false;
    this.bounds = null;
    this.pois = [];
    this.streets = [];
    this.schools = [];
    this.healthFacilities = [];
    this.busStops = [];
  }

  loadData() {
    if (this.isLoaded) return true;
    if (!fs.existsSync(this.osmPath)) {
      log.warn(`Ficheiro OSM de Amarante não encontrado em ${this.osmPath}`);
      return false;
    }

    try {
      const xml = fs.readFileSync(this.osmPath, 'utf8');
      const boundsMatch = xml.match(
        /<bounds\s+minlat="([^"]+)"\s+minlon="([^"]+)"\s+maxlat="([^"]+)"\s+maxlon="([^"]+)"/
      );
      if (boundsMatch) {
        this.bounds = {
          minLat: parseFloat(boundsMatch[1]),
          minLon: parseFloat(boundsMatch[2]),
          maxLat: parseFloat(boundsMatch[3]),
          maxLon: parseFloat(boundsMatch[4])
        };
      }

      const nodeBlockRegex = /<node\s+id="(\d+)"[^>]*lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/node>/g;
      let nodeMatch;
      while ((nodeMatch = nodeBlockRegex.exec(xml)) !== null) {
        const tagBlock = nodeMatch[4];
        const tags = {};
        const tagRegex = /<tag\s+k="([^"]+)"\s+v="([^"]+)"\/>/g;
        let t;
        while ((t = tagRegex.exec(tagBlock)) !== null) {
          tags[t[1]] = t[2];
        }
        if (Object.keys(tags).length > 0) {
          const item = {
            id: nodeMatch[1],
            lat: parseFloat(nodeMatch[2]),
            lon: parseFloat(nodeMatch[3]),
            tags,
            name: tags.name || tags['name:pt'] || ''
          };
          this.pois.push(item);
          if (tags.highway === 'bus_stop' || tags.bus === 'yes') this.busStops.push(item);
          if (tags.amenity === 'school' || tags.amenity === 'music_school' || tags.amenity === 'kindergarten') {
            this.schools.push(item);
          }
          if (tags.amenity === 'hospital' || tags.amenity === 'clinic' || tags.amenity === 'pharmacy') {
            this.healthFacilities.push(item);
          }
        }
      }

      const wayBlockRegex = /<way\s+id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g;
      let wayMatch;
      while ((wayMatch = wayBlockRegex.exec(xml)) !== null) {
        const tagBlock = wayMatch[2];
        const tags = {};
        const tagRegex = /<tag\s+k="([^"]+)"\s+v="([^"]+)"\/>/g;
        let t;
        while ((t = tagRegex.exec(tagBlock)) !== null) {
          tags[t[1]] = t[2];
        }
        if (tags.highway || tags.name) {
          const streetItem = {
            id: wayMatch[1],
            name: tags.name || tags['name:pt'] || 'Via sem nome',
            highway: tags.highway || 'unclassified',
            oneway: tags.oneway === 'yes',
            tags
          };
          this.streets.push(streetItem);
          if (tags.amenity === 'school') this.schools.push(streetItem);
        }
      }

      this.isLoaded = true;
      log.info(
        `🗺️ [OSM Amarante] Carregadas ${this.streets.length} vias, ${this.pois.length} POIs, ${this.schools.length} escolas, ${this.healthFacilities.length} unidades saúde.`
      );
      return true;
    } catch (err) {
      log.error('Erro ao carregar amarante.osm:', err.message);
      return false;
    }
  }

  search(term = '') {
    if (!this.loadData()) return { loaded: false, streets: [], pois: [] };
    const clean = String(term || '').toLowerCase().trim();
    if (!clean) return { loaded: true, streets: [], pois: [] };
    return {
      loaded: true,
      streets: this.streets.filter((s) => s.name && s.name.toLowerCase().includes(clean)).slice(0, 10),
      pois: this.pois.filter((p) => p.name && p.name.toLowerCase().includes(clean)).slice(0, 10)
    };
  }

  getUrbanInfrastructure() {
    if (!this.loadData()) {
      return { loaded: false, schools: [], health: [], supermarkets: [], streetsCount: 0, poisCount: 0 };
    }
    return {
      loaded: true,
      schools: [...new Set(this.schools.map((s) => s.name).filter(Boolean))],
      health: [...new Set(this.healthFacilities.map((h) => h.name || h.tags?.amenity).filter(Boolean))],
      supermarkets: [
        ...new Set(
          this.pois
            .filter(
              (p) =>
                p.tags?.shop === 'supermarket' ||
                p.name?.toLowerCase().includes('auchan') ||
                p.name?.toLowerCase().includes('intermarché')
            )
            .map((p) => p.name)
            .filter(Boolean)
        )
      ],
      streetsCount: this.streets.length,
      poisCount: this.pois.length
    };
  }

  getUrbanContextSummary() {
    const infra = this.getUrbanInfrastructure();
    if (!infra.loaded) return '';
    return (
      `🗺️ *Infraestrutura Urbana Verificada (OSM Amarante):*\n` +
      `• Vias mapeadas: *${infra.streetsCount}* | Pontos de interesse: *${infra.poisCount}*\n` +
      `${infra.schools.length > 0 ? `• Escolas OSM: ${infra.schools.slice(0, 4).join(', ')}\n` : ''}` +
      `${infra.health.length > 0 ? `• Saúde OSM: ${infra.health.slice(0, 4).join(', ')}\n` : ''}` +
      `${infra.supermarkets.length > 0 ? `• Comércio/Supermercados: ${infra.supermarkets.slice(0, 4).join(', ')}\n` : ''}`
    ).trim();
  }

  formatSummary(query = '') {
    if (query) {
      const hits = this.search(query);
      if (!hits.loaded) return '⚠️ Mapa OSM de Amarante indisponível no pacote atual.';
      const streetList = hits.streets.map((s) => `• Via: *${s.name}* (${s.highway})`).join('\n');
      const poiList = hits.pois.map((p) => `• Local: *${p.name}* (${p.tags?.amenity || p.tags?.shop || 'POI'})`).join('\n');
      if (!streetList && !poiList) {
        return `🗺️ *OSM Amarante:* Nenhum resultado exato encontrado para _"${query}"_.`;
      }
      return (
        `🗺️ *OSM Amarante — Pesquisa: "${query}"*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${streetList ? `${streetList}\n` : ''}` +
        `${poiList ? `${poiList}\n` : ''}`
      ).trim();
    }

    const infra = this.getUrbanInfrastructure();
    if (!infra.loaded) return '⚠️ Mapa OSM de Amarante indisponível no pacote atual.';
    return (
      `🗺️ *CARTOGRAFIA OFICIAL OSM DE AMARANTE*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Delimitação:* Lat [${this.bounds?.minLat} a ${this.bounds?.maxLat}] | Lon [${this.bounds?.minLon} a ${this.bounds?.maxLon}]\n` +
      `🛣️ *Rede Cartografada:* *${infra.streetsCount}* vias | *${infra.poisCount}* nós com tags\n` +
      `🏫 *Educação OSM:* ${infra.schools.slice(0, 6).join(', ') || 'Sem nomes registados no excerto'}\n` +
      `🏥 *Saúde OSM:* ${infra.health.slice(0, 6).join(', ') || 'Sem nomes registados no excerto'}\n` +
      `🛒 *Supermercados OSM:* ${infra.supermarkets.slice(0, 6).join(', ') || 'Sem nomes registados no excerto'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 _Pesquisa ruas ou locais com:_ \`/mapa Rua 31 de Janeiro\` _ou_ \`/mapa escola\``
    );
  }
}

export const amaranteMapService = new AmaranteMapService();
export default amaranteMapService;

