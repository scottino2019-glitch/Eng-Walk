# Cartella Audio per Dettati in Inglese

In questa cartella puoi inserire i tuoi file audio in formato **MP3** (es. `a1_01_greetings.mp3`, `lesson1.mp3`).

## Come aggiungere un nuovo dettato:
1. Copia il tuo file `.mp3` in questa cartella: `/public/audio/tuo_file.mp3`
2. Modifica il file `/public/audio/dettati.txt` aggiungendo una riga (`Difficoltà | file.mp3 | Titolo | Frase in inglese`).

Se un file `.mp3` non è ancora presente nella cartella, il Walkman riprodurrà automaticamente la frase usando la sintesi vocale nativa in inglese (Web Speech API `en-US`) mantenendo attivi i controlli di velocità, pausa e contatore.
