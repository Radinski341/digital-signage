DO $$ BEGIN
 IF (SELECT count(*) FROM legacy_archive."MediaAsset" WHERE "id"='legacy-media' AND "title"='Preserved photograph')<>1 THEN RAISE EXCEPTION 'Legacy media lost';END IF;
 IF (SELECT count(*) FROM "Banner" WHERE "id"='legacy-banner' AND "data"->>'title'='Preserved banner' AND "siteId"='initial-site' AND "status"='PUBLISHED')<>1 THEN RAISE EXCEPTION 'Banner not preserved';END IF;
 IF (SELECT count(*) FROM "SlideItem" WHERE "id"='legacy-slide-item' AND "bannerId"='legacy-banner' AND "order"=0)<>1 THEN RAISE EXCEPTION 'Playlist not preserved';END IF;
 IF (SELECT count(*) FROM "Membership" WHERE "userId"='legacy-user' AND "role"='ADMIN')<>1 THEN RAISE EXCEPTION 'User ownership not backfilled';END IF;
 IF (SELECT "publicationSnapshot"->>'name' FROM "Slide" WHERE "id"='legacy-slide')<>'Preserved slide' THEN RAISE EXCEPTION 'Published playback not preserved';END IF;
END $$;
