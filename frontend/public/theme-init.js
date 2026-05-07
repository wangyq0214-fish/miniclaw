(function(){try{
  var k='miniclaw_theme';
  var s=localStorage.getItem(k);
  var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  if(t==='dark')document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme=t;
}catch(e){}})();
