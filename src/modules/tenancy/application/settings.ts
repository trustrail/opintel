import type {z} from 'zod';
import type {ProjectSettings,CompanySettings,CompanySettingsView,PersonalSettings,PersonalSettingsView,ProjectSettingsView} from '../../../shared/api/settings.js';
import type {ProjectId,CompanyId,UserId,Result} from '../../../shared/kernel/index.js';
export interface SettingsRepository{
 project(id:ProjectId):Promise<Result<z.infer<typeof ProjectSettingsView>>>;
 saveProject(id:ProjectId,actor:UserId,settings:z.infer<typeof ProjectSettings>):Promise<Result<z.infer<typeof ProjectSettingsView>>>;
 company(id:CompanyId):Promise<Result<z.infer<typeof CompanySettingsView>>>;
 saveCompany(id:CompanyId,actor:UserId,settings:z.infer<typeof CompanySettings>):Promise<Result<z.infer<typeof CompanySettingsView>>>;
 personal(actor:UserId):Promise<Result<z.infer<typeof PersonalSettingsView>>>;
 savePersonal(actor:UserId,settings:z.infer<typeof PersonalSettings>):Promise<Result<z.infer<typeof PersonalSettingsView>>>;
}
