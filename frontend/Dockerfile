FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY src /usr/share/nginx/html/src
COPY pages/ /usr/share/nginx/html/pages/

EXPOSE 80
