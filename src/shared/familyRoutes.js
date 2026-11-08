// src/shared/familyRoutes.js — Rotas REST para sincronização com a Mini App Gestão Familiar
import { familyDb } from './familyDb.js';

export function handleFamilyApi(req, res, urlPath, method) {
  // Configurar CORS para permitir que a Mini App em gestao-familiar-webapp.vercel.app consuma a API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-requested-with');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // ─── 1. COMPRAS (/api/family/shopping) ──────────────────────────────────
  if (urlPath === '/api/family/shopping') {
    if (method === 'GET') {
      const data = familyDb.getShopping();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    }
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const itemText = parsed.itemText || parsed.item_text || parsed.text || '';
          const category = parsed.category || 'geral';
          const user = parsed.user || {};
          const created = familyDb.addShopping(itemText, category, user);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, item: created }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return true;
    }
  }

  const toggleShoppingMatch = urlPath.match(/^\/api\/family\/shopping\/([^/]+)\/toggle$/);
  if (toggleShoppingMatch && (method === 'PATCH' || method === 'POST')) {
    const id = toggleShoppingMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        familyDb.toggleShopping(id, parsed.completed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return true;
  }

  const deleteShoppingMatch = urlPath.match(/^\/api\/family\/shopping\/([^/]+)$/);
  if (deleteShoppingMatch && method === 'DELETE') {
    const id = deleteShoppingMatch[1];
    familyDb.deleteShopping(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // ─── 2. TAREFAS (/api/family/tasks) ────────────────────────────────────
  if (urlPath === '/api/family/tasks') {
    if (method === 'GET') {
      const data = familyDb.getTasks();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    }
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const title = parsed.title || parsed.task || '';
          const assignedTo = parsed.assignedTo || parsed.assigned_to || 'Ambos';
          const user = parsed.user || {};
          const created = familyDb.addTask(title, assignedTo, user);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, task: created }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return true;
    }
  }

  const toggleTaskMatch = urlPath.match(/^\/api\/family\/tasks\/([^/]+)\/toggle$/);
  if (toggleTaskMatch && (method === 'PATCH' || method === 'POST')) {
    const id = toggleTaskMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        familyDb.toggleTask(id, parsed.completed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return true;
  }

  const deleteTaskMatch = urlPath.match(/^\/api\/family\/tasks\/([^/]+)$/);
  if (deleteTaskMatch && method === 'DELETE') {
    const id = deleteTaskMatch[1];
    familyDb.deleteTask(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // ─── 3. CAROLINA / BEBÉ (/api/family/baby) ──────────────────────────────
  if (urlPath === '/api/family/baby') {
    if (method === 'GET') {
      const data = familyDb.getBabyLogs();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    }
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const eventType = parsed.eventType || parsed.event_type || 'actividades';
          const details = parsed.details || '';
          const notes = parsed.notes || '';
          const user = parsed.user || {};
          const created = familyDb.addBabyLog(eventType, details, notes, user);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, log: created }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return true;
    }
  }

  const deleteBabyMatch = urlPath.match(/^\/api\/family\/baby\/([^/]+)$/);
  if (deleteBabyMatch && method === 'DELETE') {
    const id = deleteBabyMatch[1];
    familyDb.deleteBabyLog(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // ─── 4. NOTAS (/api/family/notes) ──────────────────────────────────────
  if (urlPath === '/api/family/notes') {
    if (method === 'GET') {
      const data = familyDb.getNotes();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    }
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const title = parsed.title || 'Nota';
          const content = parsed.content || '';
          const colorTag = parsed.colorTag || parsed.color_tag || 'blue';
          const user = parsed.user || {};
          const created = familyDb.addNote(title, content, colorTag, user);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, note: created }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return true;
    }
  }

  const deleteNoteMatch = urlPath.match(/^\/api\/family\/notes\/([^/]+)$/);
  if (deleteNoteMatch && method === 'DELETE') {
    const id = deleteNoteMatch[1];
    familyDb.deleteNote(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  return false;
}

export default { handleFamilyApi };
