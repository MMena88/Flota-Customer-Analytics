-- No browser read/write policy: signed URLs are issued only after server membership checks.
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES ('puma-private','puma-private',false,31457280)
ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='puma-private' AND public) THEN
  RAISE EXCEPTION 'puma-private must be private before continuing';
 END IF;
END $$;
