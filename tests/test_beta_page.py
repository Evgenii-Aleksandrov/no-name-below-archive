import unittest
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
class Parse(HTMLParser):
 def __init__(self): super().__init__(); self.tags=[]
 def handle_starttag(self,t,a): self.tags.append((t,dict(a)))
class Beta(unittest.TestCase):
 def test_page_contract(self):
  f=ROOT/'beta/index.html';self.assertTrue(f.exists(),'beta page missing')
  text=f.read_text();p=Parse();p.feed(text)
  iframe=[a for t,a in p.tags if t=='iframe'];self.assertEqual(len(iframe),1)
  self.assertIn('docs.google.com/forms/',iframe[0]['src']);self.assertIn('embedded=true',iframe[0]['src']);self.assertTrue(iframe[0]['title'])
  self.assertTrue(any(t=='a' and 'viewform' in a.get('href','') for t,a in p.tags))
  for forbidden in ['viewanalytics','/edit','service_role','formResponse']:self.assertNotIn(forbidden,text)
  self.assertIn('Ежедневные запуски не обязательны',text)
  self.assertTrue(any(t=='meta' and a.get('name')=='viewport' for t,a in p.tags))
  self.assertFalse(any(t=='script' for t,a in p.tags))
  for t,a in p.tags:
   for k in ['src','href']:
    v=a.get(k,'')
    if v and not v.startswith(('https:','#','mailto:')):self.assertTrue((f.parent/v).exists(),v)
if __name__=='__main__':unittest.main()
