"""Build the Taipei district/village map from the city Civil Affairs dataset.

Requires requests, pyshp, pyproj and shapely. The upstream SHP is TWD97 / TM2
(EPSG:3826). Geometry is simplified by 3 m, then stored on the app's 10 m grid.
The source archive is not committed; the source URL and published date are retained.
"""
import io
import json
import math
import tempfile
import zipfile
from pathlib import Path

import requests
import shapefile
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform, unary_union

SOURCE = 'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=145e30da-58f3-45db-a125-8adc3fde2620'
ROOT = Path(__file__).resolve().parent.parent
ORIGIN = (121.55, 25.09)
KX = math.cos(math.radians(ORIGIN[1])) * 111320
KY = 110574
TO_WGS = Transformer.from_crs(3826, 4326, always_xy=True).transform

def local(x, y, z=None):
    lon, lat = TO_WGS(x, y)
    return (lon - ORIGIN[0]) * KX / 10, (ORIGIN[1] - lat) * KY / 10

def line(coords):
    return [round(n, 1) for xy in coords for n in xy[:2]]

def polygons(g):
    return list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]

def rings(g):
    return [line(r.coords) for p in polygons(g) for r in [p.exterior, *p.interiors]]

def main():
    cached = Path('/tmp/taipei-villages.zip')
    if cached.exists():
        archive = cached.read_bytes()
    else:
        r = requests.get(SOURCE, timeout=45)
        r.raise_for_status()
        archive = r.content
    districts, villages = {}, []
    with tempfile.TemporaryDirectory() as tmp:
        zipfile.ZipFile(io.BytesIO(archive)).extractall(tmp)
        reader = shapefile.Reader(str(next(Path(tmp).glob('*.shp'))), encoding='utf-8')
        for item in reader.iterShapeRecords():
            p = item.record.as_dict()
            native = shape(item.shape.__geo_interface__)
            g = transform(local, native.simplify(3, preserve_topology=True))
            center = g.representative_point()
            town, village = p['TNAME'].strip(), p['VNAME'].strip()
            districts.setdefault(town, []).append(g)
            villages.append(dict(c=p['CPTVID'].strip(), t=town, v=village,
                x=round(center.x, 1), y=round(center.y, 1), a=round(native.area / 1e6, 5), r=rings(g)))
    assert len(villages) == len({v['c'] for v in villages}) == 456
    assert len(districts) == 12
    assert all(v['v'].endswith('里') for v in villages)
    assert any(v['t'] == '大安區' and v['v'] == '學府里' for v in villages)
    district_shapes = {name: unary_union(gs) for name, gs in districts.items()}
    city = unary_union(list(district_shapes.values()))
    edges = unary_union([g.boundary for g in district_shapes.values()])
    lines = list(edges.geoms) if hasattr(edges, 'geoms') else [edges]
    towns = []
    for name, g in sorted(district_shapes.items()):
        p = g.representative_point()
        towns.append(dict(n=name, x=round(p.x, 1), y=round(p.y, 1)))
    result = dict(unit=10, origin=ORIGIN, bbox=[round(x, 1) for x in city.bounds],
        villages=sorted(villages, key=lambda v: v['c']), towns=towns,
        countyRings=rings(city), countyLines=rings(city),
        townLines=[line(g.coords) for g in lines if g.geom_type == 'LineString'],
        neighbours=[], roads=dict(primary=[], trunk=[], motorway=[]),
        source=dict(title='臺北市民政局：臺北市里界圖', url=SOURCE, published='2026-09-21',
            coverageThrough='2025-06-17', crs='EPSG:3826', simplifiedMeters=3,
            license='政府資料開放授權條款第1版'))
    ROOT.joinpath('taipei.js').write_text('/* 臺北市 12 行政區、456 里。來源與版本見 ATTRIBUTION.md。 */\nwindow.TAIPEI=' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'Built {len(towns)} districts, {len(villages)} villages; {ROOT / "taipei.js"}')

if __name__ == '__main__':
    main()
