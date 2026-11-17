import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';

const origin='http://127.0.0.1:5173';
const projectId='eb654960-2510-46d6-ade9-ea68a70bf64f';
const sceneId='proj_bedroom_japandi_4x4m';
const workflow=await (await fetch(`${origin}/api/atelier/workflow/project/${projectId}`)).json();
if(workflow.run?.source!=='issue_workflow'||workflow.run.status!=='done'||workflow.stages?.length!==10||workflow.stages.some(stage=>stage.status!=='done'))throw new Error('Actual project workflow is not complete');
const cost=await (await fetch(`${origin}/api/v1/projects/${sceneId}/cost-workflow`)).json();
if(cost.estimate.priced_line_count!==34||cost.estimate.unpriced_line_count!==0||cost.estimate.budget_mode!=='estimate_first')throw new Error('Cost or budget scope does not match accepted result');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
fs.mkdirSync('../docs/qa/workflow-completion',{recursive:true});
try {
  await page.goto(`${origin}/ATL/projects/${projectId}/workflow`);
  await expect(page.getByText('Workflow từ trạng thái task',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByText('Hoàn tất',{exact:true})).toHaveCount(11);
  await expect(page.getByText('Đã hoàn tất và bàn giao.',{exact:true})).toHaveCount(10);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({path:'../docs/qa/workflow-completion/workflow-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'../docs/qa/workflow-completion/workflow-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${origin}/ATL/cost-estimation`);
  await expect(page.getByTestId('cost-line')).toHaveCount(34);
  await expect(page.getByText('34/34 hạng mục · 100%',{exact:true})).toBeVisible();
  await expect(page.getByText('Lập dự toán trước, chưa giới hạn ngân sách.',{exact:true})).toBeVisible();
  await page.screenshot({path:'../docs/qa/workflow-completion/cost-34-desktop.png',fullPage:true});
  await page.goto(`${origin}/ATL/design-studio`);
  await expect(page.locator('canvas').first()).toBeVisible({timeout:30000});
  if(!(await page.getByText(/77 mesh/).count()))await page.getByRole('button',{name:'Inspector',exact:true}).click();
  await expect(page.getByText(/77 mesh/).first()).toBeVisible({timeout:30000});
  await page.screenshot({path:'../docs/qa/workflow-completion/current-glb-studio.png',fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ok:true,stage_count:10,root:'done',source:workflow.run.source,priced:34,total_reference_vnd:cost.estimate.total_vnd,model_loaded:true,page_errors:errors}));
} finally {await browser.close();}
