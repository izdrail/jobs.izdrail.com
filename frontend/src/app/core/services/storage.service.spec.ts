import { StorageService } from './storage.service';

describe('StorageService (browser)', () => {
  let service: StorageService;

  beforeEach(async () => {
    localStorage.clear();
    service = new StorageService();
    await service.init();
  });

  it('sets and gets values', () => {
    service.set('k', 'v');
    expect(service.get('k')).toBe('v');
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('hydrates from existing localStorage on init', async () => {
    localStorage.setItem('preexisting', 'yes');
    const fresh = new StorageService();
    await fresh.init();
    expect(fresh.get('preexisting')).toBe('yes');
  });

  it('removes values', () => {
    service.set('k', 'v');
    service.remove('k');
    expect(service.get('k')).toBeNull();
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('returns null for missing keys', () => {
    expect(service.get('nope')).toBeNull();
  });
});
