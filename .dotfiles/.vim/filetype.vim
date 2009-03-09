augroup filetypedetect
  au BufNewFile,BufRead *.wiki setf Wikipedia
augroup END

augroup markdown
  au! BufRead,BufNewFile *.mkd   setfiletype mkd
augroup END

