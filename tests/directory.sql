INSERT INTO categories (name) VALUES ('Kuliner Uji'), ('Jasa Uji');
INSERT INTO cities (name) VALUES ('Bandung Uji'), ('Bogor Uji');
INSERT INTO listings (id, business_name, description, asking_price, whatsapp, address, category_id, city_id, published, price_includes, price_excludes) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Warung Mawar Uji', 'Deskripsi rahasia satu', 100000000, '628123456701', 'Alamat rahasia satu', 2, 2, true, 'Peralatan', 'Properti'),
  ('10000000-0000-4000-8000-000000000002', 'Salon Melati Uji', 'Deskripsi rahasia dua', 200000000, '628123456702', 'Alamat rahasia dua', 3, 3, true, 'Peralatan', 'Properti'),
  ('10000000-0000-4000-8000-000000000003', 'Warung Draf Rahasia', 'Draf', 100000000, '628123456703', '', 2, 2, false, '', ''),
  ('10000000-0000-4000-8000-000000000004', 'Warung Ditarik Rahasia', 'Ditarik', 100000000, '628123456704', '', 2, 2, false, '', '');
INSERT INTO listing_photos (id, listing_id, object_key, content_type) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'image/png'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'image/png');
