/**
 * The six alert-path function bodies exactly as production stores them. OWNER
 * START SQL and OWNER FINISH SQL pin these, not the migration text.
 *
 * Measured 2026-09-16 by scripts/security/sql/alert-definition-drift.sql, run by
 * the owner against production: rows 10-15 gave md5(prosrc) and the line count,
 * row 50 gave the source. A body was accepted only when its md5 equalled the
 * measured value, so each one below is byte-exact, not a transcription.
 *
 * Production differs from supabase/migrations in text only: CRLF line endings,
 * no comments, and a few statements joined onto one line.
 * __tests__/productionDefinitions.test.ts proves the bodies token-identical to
 * the migrations once comments and whitespace are set aside, and proves the
 * alerts they raise are EXPECTED_ALERTS. The migrations remain the repository
 * record of intent; this file is the record of what is deployed.
 *
 * If production is redefined, the pins STOP the capture. Re-run the drift audit
 * and re-measure this file; never edit a hash to make a gate pass.
 *
 * Node-only: used by tests and the capture harness, never by the app.
 */

export const PRODUCTION_MEASURED_ON = '2026-09-16';

export interface ProductionDefinition {
  name: string;
  /** md5(prosrc), as measured in production. */
  exactMd5: string;
  /** md5 of prosrc with whitespace runs collapsed to one space and trimmed. */
  normalizedMd5: string;
  /** Line count, as measured in production. */
  lineCount: number;
  /** prosrc, byte for byte. */
  prosrc: string;
}

const crlf = (lines: readonly string[]) => lines.join('\r\n');

export const PRODUCTION_DEFINITIONS: readonly ProductionDefinition[] = [
  {
    name: 'alert_ro_status_changed',
    exactMd5: 'a2191579b54da621f31440a414a3985b',
    normalizedMd5: '570ef46ce24cae0d16080b3c4d3e6830',
    lineCount: 13,
    prosrc: crlf([
      '',
      'BEGIN',
      '  IF NEW.status IS DISTINCT FROM OLD.status THEN',
      "    IF NEW.status <> 'Pending Approval' THEN",
      '      PERFORM public.emit_alert_event(',
      "        NEW.shop_id, 'ro.status_changed', NULL,",
      "        COALESCE(NEW.ro_number, 'A repair order') || ' → ' || NEW.status,",
      "        COALESCE(NEW.customer_name, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,",
      "        'repair_order', NEW.id::text);",
      '    END IF;',
      '  END IF;',
      '  RETURN NEW;',
      'END ',
    ]),
  },
  {
    name: 'alert_ro_pending_approval',
    exactMd5: '1ab02bf494eb4a26b0e30d94986687df',
    normalizedMd5: '64d2a3a9ad137fc1ee48daf8c4107674',
    lineCount: 11,
    prosrc: crlf([
      '',
      'BEGIN',
      "  IF NEW.status = 'Pending Approval' AND NEW.status IS DISTINCT FROM OLD.status THEN",
      '    PERFORM public.emit_alert_event(',
      "      NEW.shop_id, 'ro.pending_approval', NULL,",
      "      COALESCE(NEW.ro_number, 'A repair order') || ' is ready for QA sign-off',",
      "      COALESCE(NEW.customer_name, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,",
      "      'repair_order', NEW.id::text);",
      '  END IF;',
      '  RETURN NEW;',
      'END ',
    ]),
  },
  {
    name: 'emit_alert_event',
    exactMd5: 'de591ac4c49b3955d6ab6484e961e319',
    normalizedMd5: '8fd2dbfabe529f640aedc1d79a9fd0bf',
    lineCount: 6,
    prosrc: crlf([
      '',
      '  INSERT INTO public.alert_events',
      '    (shop_id, event_type, target_role, title, body, entity_type, entity_id, created_by)',
      '  VALUES',
      '    (p_shop_id, p_event_type, p_target_role, p_title, p_body, p_entity_type, p_entity_id, auth.uid());',
      '',
    ]),
  },
  {
    name: 'record_ro_status_change',
    exactMd5: '29006f00617e1bbf1240c7cfa2a0d632',
    normalizedMd5: '4d46681b324bd342f4b7a0d99217f4e7',
    lineCount: 11,
    prosrc: crlf([
      '',
      'BEGIN',
      '  IF NEW.status IS DISTINCT FROM OLD.status THEN',
      '    INSERT INTO public.ro_status_events',
      '      (shop_id, repair_order_id, ro_number, customer_name, vehicle, old_status, new_status, changed_by)',
      '    VALUES',
      '      (NEW.shop_id, NEW.id, NEW.ro_number, NEW.customer_name, NEW.vehicle, OLD.status, NEW.status, auth.uid());',
      '  END IF;',
      '  RETURN NEW;',
      'END',
      '',
    ]),
  },
  {
    name: 'alert_job_assigned',
    exactMd5: '701f06455314080c5864e3d429cde448',
    normalizedMd5: '91dd7e1083a24a21158863c6c07fdd8c',
    lineCount: 40,
    prosrc: crlf([
      '',
      'DECLARE',
      '  added   TEXT;',
      '  target  UUID;',
      '  is_member BOOLEAN;',
      'BEGIN',
      '  FOR added IN',
      "    SELECT jsonb_array_elements_text(COALESCE(to_jsonb(NEW.technicians), '[]'::jsonb))",
      '    EXCEPT',
      "    SELECT jsonb_array_elements_text(COALESCE(to_jsonb(OLD.technicians), '[]'::jsonb))",
      '  LOOP',
      '    SELECT t.user_id INTO target',
      '    FROM public.technicians t',
      '    WHERE t.shop_id = NEW.shop_id',
      '      AND t.name = added',
      '      AND t.user_id IS NOT NULL',
      '    LIMIT 1;',
      '',
      '    IF target IS NOT NULL THEN',
      '      SELECT EXISTS (',
      '        SELECT 1 FROM public.shop_users su',
      '        WHERE su.user_id = target AND su.shop_id = NEW.shop_id',
      '      ) INTO is_member;',
      '',
      '      IF is_member THEN',
      '        INSERT INTO public.alert_events',
      '          (shop_id, event_type, target_user_id, title, body, entity_type, entity_id, created_by)',
      '        VALUES',
      "          (NEW.shop_id, 'job.assigned', target,",
      "           'You have been assigned ' || COALESCE(NEW.id::text, 'a job'),",
      "           COALESCE(NEW.customer, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,",
      "           'job_card', NEW.id::text, auth.uid());",
      '      ELSE',
      "        RAISE WARNING 'job.assigned skipped: % is linked in shop % but is not a member of it',",
      '          added, NEW.shop_id;',
      '      END IF;',
      '    END IF;',
      '  END LOOP;',
      '  RETURN NEW;',
      'END ',
    ]),
  },
  {
    name: 'alert_job_work_added',
    exactMd5: '0e105ae3cd75ed3da504bb5ac3939c5f',
    normalizedMd5: '873a5b316f9bada3535eb76ad2617afa',
    lineCount: 54,
    prosrc: crlf([
      '',
      'DECLARE',
      '  who       TEXT;',
      '  target    UUID;',
      '  changed   TEXT[] := ARRAY[]::TEXT[];',
      '  summary   TEXT;',
      'BEGIN',
      '  IF NEW.service_type IS DISTINCT FROM OLD.service_type THEN',
      "    changed := changed || ARRAY['service'];",
      '  END IF;',
      "  IF COALESCE(NEW.notes, '') IS DISTINCT FROM COALESCE(OLD.notes, '')",
      "     AND COALESCE(NEW.notes, '') <> '' THEN",
      "    changed := changed || ARRAY['notes'];",
      '  END IF;',
      '  IF COALESCE(NEW.labor_hours, 0) IS DISTINCT FROM COALESCE(OLD.labor_hours, 0) THEN',
      "    changed := changed || ARRAY['labour hours'];",
      '  END IF;',
      '  IF COALESCE(NEW.parts_total, 0) IS DISTINCT FROM COALESCE(OLD.parts_total, 0) THEN',
      "    changed := changed || ARRAY['parts'];",
      '  END IF;',
      '',
      '  IF array_length(changed, 1) IS NULL THEN',
      '    RETURN NEW;',
      '  END IF;',
      '',
      "  summary := array_to_string(changed, ', ');",
      '',
      '  FOR who IN',
      "    SELECT jsonb_array_elements_text(COALESCE(to_jsonb(NEW.technicians), '[]'::jsonb))",
      '    INTERSECT',
      "    SELECT jsonb_array_elements_text(COALESCE(to_jsonb(OLD.technicians), '[]'::jsonb))",
      '  LOOP',
      '    SELECT t.user_id INTO target',
      '    FROM public.technicians t',
      '    WHERE t.shop_id = NEW.shop_id AND t.name = who AND t.user_id IS NOT NULL',
      '    LIMIT 1;',
      '',
      '    IF target IS NOT NULL',
      '       AND target IS DISTINCT FROM auth.uid()',
      '       AND EXISTS (SELECT 1 FROM public.shop_users su',
      '                   WHERE su.user_id = target AND su.shop_id = NEW.shop_id)',
      '    THEN',
      '      INSERT INTO public.alert_events',
      '        (shop_id, event_type, target_user_id, title, body, entity_type, entity_id, created_by)',
      '      VALUES',
      "        (NEW.shop_id, 'job.work_added', target,",
      "         NEW.id || ' updated — ' || summary,",
      "         COALESCE(NEW.customer, '') || CASE WHEN NEW.vehicle IS NULL THEN '' ELSE ' · ' || NEW.vehicle END,",
      "         'job_card', NEW.id, auth.uid());",
      '    END IF;',
      '  END LOOP;',
      '',
      '  RETURN NEW;',
      'END ',
    ]),
  },
];

export function productionDefinition(name: string): ProductionDefinition {
  const found = PRODUCTION_DEFINITIONS.find(d => d.name === name);
  if (!found) throw new Error(`no production definition pinned for ${name}`);
  return found;
}
