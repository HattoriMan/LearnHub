# a file to download a sample test video

from yt_dlp import YoutubeDL

url = "https://www.youtube.com/watch?v=HXV3zeQKqGY"

ydl_opts = {
    'format': 'best[ext=mp4]',  # only single-file mp4 (no merging)
    'outtmpl': '%(title)s.%(ext)s',
}

with YoutubeDL(ydl_opts) as ydl:
    ydl.download([url])