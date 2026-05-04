import { existsSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const PLAYER_PHOTO_DIR = join(process.cwd(), 'public', 'players');
const PLAYER_PHOTO_WEB_ROOT = '/players';
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export function getInitials(name = '') {
  return String(name)
    .replace(',', ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
}

export function getPlayerPhotoFile(slug = '') {
  if (!slug) return '';
  for (const ext of PHOTO_EXTENSIONS) {
    const fileName = `${slug}${ext}`;
    if (existsSync(join(PLAYER_PHOTO_DIR, fileName))) return fileName;
  }
  return '';
}

export function getPlayerPhotoSrc(slug = '') {
  const fileName = getPlayerPhotoFile(slug);
  return fileName ? `${PLAYER_PHOTO_WEB_ROOT}/${fileName}` : '';
}

export function getPlayerMedia(player = {}) {
  const slug = player?.slug ?? '';
  const name = player?.name ?? '';
  const photo = getPlayerPhotoSrc(slug);
  return {
    photo,
    hasPhoto: Boolean(photo),
    initials: getInitials(name),
  };
}

export function listPlayerPhotoFiles() {
  if (!existsSync(PLAYER_PHOTO_DIR)) return [];
  return readdirSync(PLAYER_PHOTO_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => PHOTO_EXTENSIONS.includes(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

export function normalizePhotoBase(fileName = '') {
  return basename(String(fileName), extname(String(fileName)))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
