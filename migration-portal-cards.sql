ALTER TABLE applications ADD COLUMN label TEXT;
ALTER TABLE applications ADD COLUMN portal_section TEXT NOT NULL DEFAULT 'root';
ALTER TABLE applications ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE applications SET label = 'Eventos', portal_section = 'root', sort_order = 10 WHERE code = 'calendario-eventos';
UPDATE applications SET label = 'Interno', portal_section = 'root', sort_order = 20 WHERE code = 'reuniones';
UPDATE applications SET label = 'Proyectos', portal_section = 'innovacion', sort_order = 10 WHERE code = 'portal-proyectos-innovacion';
UPDATE applications SET label = 'Jornadas', portal_section = 'innovacion', sort_order = 20 WHERE code = 'gestion-jornadas';
