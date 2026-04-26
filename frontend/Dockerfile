FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/index.html /usr/share/nginx/html/index.html
COPY src /usr/share/nginx/html/src
COPY pages/ /usr/share/nginx/html/pages/

EXPOSE 80
