INSERT INTO "User" ("id","email","password","updatedAt") VALUES ('legacy-user','legacy@example.test','not-a-login-hash',CURRENT_TIMESTAMP);
INSERT INTO "MediaAsset" ("id","url","title","updatedAt") VALUES ('legacy-media','https://example.test/preserved.jpg','Preserved photograph',CURRENT_TIMESTAMP);
INSERT INTO "Template" ("id","name","updatedAt") VALUES ('legacy-template','Legacy promotion',CURRENT_TIMESTAMP);
INSERT INTO "TemplateField" ("id","templateId","key","label","type") VALUES ('legacy-field','legacy-template','title','Title','TEXT');
INSERT INTO "Banner" ("id","templateId","data","updatedAt") VALUES ('legacy-banner','legacy-template','{"title":"Preserved banner"}',CURRENT_TIMESTAMP);
INSERT INTO "Slide" ("id","name","updatedAt") VALUES ('legacy-slide','Preserved slide',CURRENT_TIMESTAMP);
INSERT INTO "SlideItem" ("id","slideId","bannerId","order") VALUES ('legacy-slide-item','legacy-slide','legacy-banner',0);
