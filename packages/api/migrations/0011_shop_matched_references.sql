-- 0011 Shop-matched references (review finding 1, D7).
--
-- Until now every foreign key named the parent's id only, so a row could point at a parent,
-- scale or location of another shop. From here on a reference between two shop-scoped tables
-- is a composite key: the child's (shop_id, x_id) must match the parent's (shop_id, id), so a
-- cross-shop reference is rejected by the database itself.
--
--   * every referenced shop-scoped table gets a unique (shop_id, id) key;
--   * every single-column foreign key between shop-scoped tables is replaced, under the same
--     name, by a composite one. Nullable references stay optional (MATCH SIMPLE: a null x_id
--     is not checked). Foreign keys to shops itself are unchanged.
--
-- Keys stay deferrable, initially immediate, like every other foreign key (schema.test.ts).

-- Referenced tables: (shop_id, id) is the target of the composite keys below.
alter table broadcasts add constraint broadcasts_shop_id_id_key unique (shop_id, id);
alter table customers add constraint customers_shop_id_id_key unique (shop_id, id);
alter table karigar_jobs add constraint karigar_jobs_shop_id_id_key unique (shop_id, id);
alter table karigars add constraint karigars_shop_id_id_key unique (shop_id, id);
alter table lead_items add constraint lead_items_shop_id_id_key unique (shop_id, id);
alter table leads add constraint leads_shop_id_id_key unique (shop_id, id);
alter table locations add constraint locations_shop_id_id_key unique (shop_id, id);
alter table metal_pools add constraint metal_pools_shop_id_id_key unique (shop_id, id);
alter table order_copies add constraint order_copies_shop_id_id_key unique (shop_id, id);
alter table parcels add constraint parcels_shop_id_id_key unique (shop_id, id);
alter table pieces add constraint pieces_shop_id_id_key unique (shop_id, id);
alter table scales add constraint scales_shop_id_id_key unique (shop_id, id);
alter table staff_members add constraint staff_members_shop_id_id_key unique (shop_id, id);
alter table stock_outs add constraint stock_outs_shop_id_id_key unique (shop_id, id);
alter table users add constraint users_shop_id_id_key unique (shop_id, id);

-- Referencing tables: replace each id-only foreign key with a (shop_id, x_id) one.
alter table audit_entries
  drop constraint audit_entries_actor_id_fkey,
  add constraint audit_entries_actor_id_fkey foreign key (shop_id, actor_id) references users (shop_id, id) deferrable initially immediate;
alter table broadcast_pieces
  drop constraint broadcast_pieces_broadcast_id_fkey,
  add constraint broadcast_pieces_broadcast_id_fkey foreign key (shop_id, broadcast_id) references broadcasts (shop_id, id) deferrable initially immediate,
  drop constraint broadcast_pieces_piece_id_fkey,
  add constraint broadcast_pieces_piece_id_fkey foreign key (shop_id, piece_id) references pieces (shop_id, id) deferrable initially immediate;
alter table broadcast_recipients
  drop constraint broadcast_recipients_broadcast_id_fkey,
  add constraint broadcast_recipients_broadcast_id_fkey foreign key (shop_id, broadcast_id) references broadcasts (shop_id, id) deferrable initially immediate,
  drop constraint broadcast_recipients_customer_id_fkey,
  add constraint broadcast_recipients_customer_id_fkey foreign key (shop_id, customer_id) references customers (shop_id, id) deferrable initially immediate;
alter table customer_history
  drop constraint customer_history_customer_id_fkey,
  add constraint customer_history_customer_id_fkey foreign key (shop_id, customer_id) references customers (shop_id, id) deferrable initially immediate;
alter table karigar_gap_history
  drop constraint karigar_gap_history_karigar_id_fkey,
  add constraint karigar_gap_history_karigar_id_fkey foreign key (shop_id, karigar_id) references karigars (shop_id, id) deferrable initially immediate;
alter table karigar_jobs
  drop constraint karigar_jobs_karigar_id_fkey,
  add constraint karigar_jobs_karigar_id_fkey foreign key (shop_id, karigar_id) references karigars (shop_id, id) deferrable initially immediate,
  drop constraint karigar_jobs_order_copy_id_fkey,
  add constraint karigar_jobs_order_copy_id_fkey foreign key (shop_id, order_copy_id) references order_copies (shop_id, id) deferrable initially immediate,
  drop constraint karigar_jobs_parcel_id_fkey,
  add constraint karigar_jobs_parcel_id_fkey foreign key (shop_id, parcel_id) references parcels (shop_id, id) deferrable initially immediate;
alter table lead_fields
  drop constraint lead_fields_lead_id_fkey,
  add constraint lead_fields_lead_id_fkey foreign key (shop_id, lead_id) references leads (shop_id, id) deferrable initially immediate;
alter table lead_items
  drop constraint lead_items_lead_id_fkey,
  add constraint lead_items_lead_id_fkey foreign key (shop_id, lead_id) references leads (shop_id, id) deferrable initially immediate,
  drop constraint lead_items_route_job_id_fkey,
  add constraint lead_items_route_job_id_fkey foreign key (shop_id, route_job_id) references karigar_jobs (shop_id, id) deferrable initially immediate,
  drop constraint lead_items_route_piece_id_fkey,
  add constraint lead_items_route_piece_id_fkey foreign key (shop_id, route_piece_id) references pieces (shop_id, id) deferrable initially immediate;
alter table order_copies
  drop constraint order_copies_job_id_fkey,
  add constraint order_copies_job_id_fkey foreign key (shop_id, job_id) references karigar_jobs (shop_id, id) deferrable initially immediate,
  drop constraint order_copies_karigar_id_fkey,
  add constraint order_copies_karigar_id_fkey foreign key (shop_id, karigar_id) references karigars (shop_id, id) deferrable initially immediate,
  drop constraint order_copies_lead_id_fkey,
  add constraint order_copies_lead_id_fkey foreign key (shop_id, lead_id) references leads (shop_id, id) deferrable initially immediate,
  drop constraint order_copies_lead_item_id_fkey,
  add constraint order_copies_lead_item_id_fkey foreign key (shop_id, lead_item_id) references lead_items (shop_id, id) deferrable initially immediate;
alter table order_copy_images
  drop constraint order_copy_images_order_copy_id_fkey,
  add constraint order_copy_images_order_copy_id_fkey foreign key (shop_id, order_copy_id) references order_copies (shop_id, id) deferrable initially immediate;
alter table parcel_manifest_rows
  drop constraint parcel_manifest_rows_parcel_id_fkey,
  add constraint parcel_manifest_rows_parcel_id_fkey foreign key (shop_id, parcel_id) references parcels (shop_id, id) deferrable initially immediate;
alter table parcel_qc_ticks
  drop constraint parcel_qc_ticks_parcel_id_fkey,
  add constraint parcel_qc_ticks_parcel_id_fkey foreign key (shop_id, parcel_id) references parcels (shop_id, id) deferrable initially immediate,
  drop constraint parcel_qc_ticks_piece_id_fkey,
  add constraint parcel_qc_ticks_piece_id_fkey foreign key (shop_id, piece_id) references pieces (shop_id, id) deferrable initially immediate;
alter table parcels
  drop constraint parcels_job_id_fkey,
  add constraint parcels_job_id_fkey foreign key (shop_id, job_id) references karigar_jobs (shop_id, id) deferrable initially immediate,
  drop constraint parcels_karigar_id_fkey,
  add constraint parcels_karigar_id_fkey foreign key (shop_id, karigar_id) references karigars (shop_id, id) deferrable initially immediate,
  drop constraint parcels_location_id_fkey,
  add constraint parcels_location_id_fkey foreign key (shop_id, location_id) references locations (shop_id, id) deferrable initially immediate,
  drop constraint parcels_recheck_piece_id_fkey,
  add constraint parcels_recheck_piece_id_fkey foreign key (shop_id, recheck_piece_id) references pieces (shop_id, id) deferrable initially immediate;
alter table parcel_weighings
  drop constraint parcel_weighings_location_id_fkey,
  add constraint parcel_weighings_location_id_fkey foreign key (shop_id, location_id) references locations (shop_id, id) deferrable initially immediate,
  drop constraint parcel_weighings_parcel_id_fkey,
  add constraint parcel_weighings_parcel_id_fkey foreign key (shop_id, parcel_id) references parcels (shop_id, id) deferrable initially immediate,
  drop constraint parcel_weighings_scale_id_fkey,
  add constraint parcel_weighings_scale_id_fkey foreign key (shop_id, scale_id) references scales (shop_id, id) deferrable initially immediate;
alter table password_links
  drop constraint password_links_user_id_fkey,
  add constraint password_links_user_id_fkey foreign key (shop_id, user_id) references users (shop_id, id) deferrable initially immediate;
alter table piece_edits
  drop constraint piece_edits_piece_id_fkey,
  add constraint piece_edits_piece_id_fkey foreign key (shop_id, piece_id) references pieces (shop_id, id) deferrable initially immediate;
alter table piece_photos
  drop constraint piece_photos_piece_id_fkey,
  add constraint piece_photos_piece_id_fkey foreign key (shop_id, piece_id) references pieces (shop_id, id) deferrable initially immediate;
alter table pieces
  drop constraint pieces_job_id_fkey,
  add constraint pieces_job_id_fkey foreign key (shop_id, job_id) references karigar_jobs (shop_id, id) deferrable initially immediate,
  drop constraint pieces_location_id_fkey,
  add constraint pieces_location_id_fkey foreign key (shop_id, location_id) references locations (shop_id, id) deferrable initially immediate,
  drop constraint pieces_made_by_id_fkey,
  add constraint pieces_made_by_id_fkey foreign key (shop_id, made_by_id) references karigars (shop_id, id) deferrable initially immediate,
  drop constraint pieces_parcel_id_fkey,
  add constraint pieces_parcel_id_fkey foreign key (shop_id, parcel_id) references parcels (shop_id, id) deferrable initially immediate,
  drop constraint pieces_scale_id_fkey,
  add constraint pieces_scale_id_fkey foreign key (shop_id, scale_id) references scales (shop_id, id) deferrable initially immediate,
  drop constraint pieces_stock_out_id_fkey,
  add constraint pieces_stock_out_id_fkey foreign key (shop_id, stock_out_id) references stock_outs (shop_id, id) deferrable initially immediate;
alter table pool_entries
  drop constraint pool_entries_location_id_fkey,
  add constraint pool_entries_location_id_fkey foreign key (shop_id, location_id) references locations (shop_id, id) deferrable initially immediate,
  drop constraint pool_entries_metal_pool_id_fkey,
  add constraint pool_entries_metal_pool_id_fkey foreign key (shop_id, metal_pool_id) references metal_pools (shop_id, id) deferrable initially immediate;
alter table problems
  drop constraint problems_job_id_fkey,
  add constraint problems_job_id_fkey foreign key (shop_id, job_id) references karigar_jobs (shop_id, id) deferrable initially immediate,
  drop constraint problems_parcel_id_fkey,
  add constraint problems_parcel_id_fkey foreign key (shop_id, parcel_id) references parcels (shop_id, id) deferrable initially immediate,
  drop constraint problems_piece_id_fkey,
  add constraint problems_piece_id_fkey foreign key (shop_id, piece_id) references pieces (shop_id, id) deferrable initially immediate;
alter table scales
  drop constraint scales_location_id_fkey,
  add constraint scales_location_id_fkey foreign key (shop_id, location_id) references locations (shop_id, id) deferrable initially immediate;
alter table scrap_requests
  drop constraint scrap_requests_piece_id_fkey,
  add constraint scrap_requests_piece_id_fkey foreign key (shop_id, piece_id) references pieces (shop_id, id) deferrable initially immediate;
alter table sessions
  drop constraint sessions_user_id_fkey,
  add constraint sessions_user_id_fkey foreign key (shop_id, user_id) references users (shop_id, id) deferrable initially immediate;
alter table stock_out_pieces
  drop constraint stock_out_pieces_piece_id_fkey,
  add constraint stock_out_pieces_piece_id_fkey foreign key (shop_id, piece_id) references pieces (shop_id, id) deferrable initially immediate,
  drop constraint stock_out_pieces_stock_out_id_fkey,
  add constraint stock_out_pieces_stock_out_id_fkey foreign key (shop_id, stock_out_id) references stock_outs (shop_id, id) deferrable initially immediate;
alter table stock_outs
  drop constraint stock_outs_seller_id_fkey,
  add constraint stock_outs_seller_id_fkey foreign key (shop_id, seller_id) references staff_members (shop_id, id) deferrable initially immediate;
alter table users
  drop constraint users_karigar_id_fkey,
  add constraint users_karigar_id_fkey foreign key (shop_id, karigar_id) references karigars (shop_id, id) deferrable initially immediate;
alter table wishes
  drop constraint wishes_customer_id_fkey,
  add constraint wishes_customer_id_fkey foreign key (shop_id, customer_id) references customers (shop_id, id) deferrable initially immediate;
