import Path; import re; def remove_c_comments(text): out=[]; i=0; n=len(text); state='code';
 while i<n:
  c=text[i]
  if state=='code':
    if c=='"' or c=="'": quote=c; out.append(c); i+=1; state='string'; continue
    if c=='/' and i+1<n and text[i+1]=='/': i+=2
    while i<n and text[i] != '\n': i+=1; continue
    if c=='/' and i+1<n and text[i+1]=='*': i+=2
    while i+1<n and not (text[i]=='*' and text[i+1]=='/'): i+=1; if i>=n: break
    i+=2; continue
    out.append(c); i+=1
  elif state=='string':
    out.append(c)
    if c=='\':
      if i+1<n: out.append(text[i+1]); i+=2; continue
    if c==quote: state='code'
    i+=1
 return ''.join(out)
for path in [Path('esp32/main/main.c'), Path('mosquitto/config/mosquitto.conf')]:
 text=path.read_text('utf-8')
 if path.name=='main.c': clean=remove_c_comments(text); clean=re.sub(r'\n{3,}','\n\n',clean)
 else: clean='\n'.join([line for line in text.splitlines() if line.strip() and not line.lstrip().startswith('#')])+'\n'
 path.write_text(clean,'utf-8')
 print('cleaned', path)"