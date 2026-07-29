export async function login(p){
  await p.goto('http://localhost:3000/login',{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForSelector('#login-email',{timeout:60000});
  await p.waitForTimeout(4000);
  const btn=p.locator('button[type="submit"]');
  for(let a=1;a<=5;a++){
    try{ await p.getByRole('button',{name:'Admin',exact:true}).click({timeout:10000}); }catch{}
    await p.waitForTimeout(600);
    await p.locator('#login-email').fill('');
    await p.locator('#login-email').pressSequentially('admin@rillcod.com',{delay:40});
    await p.locator('#login-password').fill('');
    await p.locator('#login-password').pressSequentially('password123',{delay:40});
    await p.locator('#login-password').press('Tab');
    await p.waitForTimeout(1500);
    if((await p.locator('#login-email').inputValue())==='admin@rillcod.com' && !(await btn.isDisabled())){
      await btn.click({timeout:30000});
      await p.waitForURL('**/dashboard',{timeout:90000});
      return true;
    }
    await p.waitForTimeout(1500);
  }
  throw new Error('login failed');
}
