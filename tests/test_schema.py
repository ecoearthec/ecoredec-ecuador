import sqlite3, pathlib, unittest
SQL=pathlib.Path('migrations/0001_init.sql').read_text()
class SchemaTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON');self.db.executescript(SQL)
 def test_private_records_and_verified_map_view(self):
  d=self.db
  d.execute("INSERT INTO organizations(id,name,organization_type,description,activity,official_url,verification_status,is_published,location_public,latitude,longitude,last_verified_at) VALUES('o1','Org test','NGO','Desc','Conservación','https://example.org','pending',0,1,-0.2,-78.5,NULL)")
  self.assertEqual(d.execute('SELECT count(*) FROM public_map_points').fetchone()[0],0)
  d.execute("INSERT INTO sources(id,entity_type,entity_id,title,url,consulted_at,limitations) VALUES('s1','organization','o1','Fuente','https://example.org','2026-10-29','Alcance por confirmar')")
  d.execute("UPDATE organizations SET verification_status='verified',is_published=1,last_verified_at='2026-10-29' WHERE id='o1'")
  self.assertEqual(d.execute('SELECT count(*) FROM public_map_points').fetchone()[0],1)
  d.execute("INSERT INTO reports(id,category,description,province,canton,occurred_on,contact_email,private_location) VALUES('r1','Vertido','Descripción suficientemente detallada','Pichincha','Quito','2026-10-29','privado@example.org','Ubicación privada')")
  self.assertEqual(d.execute('SELECT count(*) FROM public_map_points WHERE category="report"').fetchone()[0],0)
  d.execute("UPDATE reports SET status='verified',public_consent=1,location_public=1,public_summary='Resumen anónimo',latitude=-0.2,longitude=-78.5,location_verified=1 WHERE id='r1'")
  row=d.execute('SELECT title,latitude,longitude FROM public_map_points WHERE category="report"').fetchone()
  self.assertEqual(row,('Resumen anónimo',-0.2,-78.5))
  self.assertNotIn('privado@example.org',str(row))
 def test_enforces_report_categories_and_statuses(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO reports(id,category,description,province,canton,occurred_on) VALUES('x','Fake','desc','Pichincha','Quito','2026-10-29')")
if __name__=='__main__':unittest.main()
