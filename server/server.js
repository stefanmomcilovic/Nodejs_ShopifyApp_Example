import "@babel/polyfill";
import dotenv from "dotenv";
import "isomorphic-fetch";
import createShopifyAuth, { verifyRequest } from "@shopify/koa-shopify-auth";
import Shopify, { ApiVersion } from "@shopify/shopify-api";
import Koa from "koa";
import next from "next";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";
import session from "koa-session";

import { storeCallback, loadCallback, deleteCallback } from "./custom-session";
const sequelize = require("./database/database");
const { Shopify_custom_session_storage } = require("./../models/sequelizeModels");


sequelize.sync()
  .then(() => {
    dotenv.config();
    const port = parseInt(process.env.PORT, 10) || 8081;
    const dev = process.env.NODE_ENV !== "production";
    const app = next({
      dev,
    });
    const handle = app.getRequestHandler();

    Shopify.Context.initialize({
      API_KEY: process.env.SHOPIFY_API_KEY,
      API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
      SCOPES: process.env.SCOPES.split(","),
      HOST_NAME: process.env.HOST.replace(/https:\/\/|\/$/g, ""),
      API_VERSION: ApiVersion.October20,
      IS_EMBEDDED_APP: true,
      // This should be replaced with your preferred storage strategy
      SESSION_STORAGE: new Shopify.Session.CustomSessionStorage(storeCallback, loadCallback, deleteCallback)
    });

    // Storing the currently active shops in memory will force them to re-login when your server restarts. You should
    // persist this object in your app.
    // const ACTIVE_SHOPIFY_SHOPS = {};

    app.prepare().then(async () => {
      const server = new Koa();
      const router = new Router();

      server.use(bodyParser());
      server.use(session(server));

      server.keys = [Shopify.Context.API_SECRET_KEY];

      server.use(
        createShopifyAuth({
          async afterAuth(ctx) {
            // Access token and shop available in ctx.state.shopify
            const { shop, accessToken, scope } = ctx.state.shopify;
            const host = ctx.query.host;

            // Getting users data from database and saving it to variable //
              try {
                let user = await Shopify_custom_session_storage.findAll({
                    raw: true,
                    where:{
                      shop: shop
                    },
                    limit:1
                  });
              } catch(err) {
                console.log(err);
                throw err;
              }
            //  End of Getting users data from database and saving it to variable //
            // ACTIVE_SHOPIFY_SHOPS[shop] = scope;

            const response = await Shopify.Webhooks.Registry.register({
              shop,
              accessToken,
              path: "/webhooks",
              topic: "APP_UNINSTALLED",
              webhookHandler: async (topic, shop, body) =>{
                // return delete ACTIVE_SHOPIFY_SHOPS[shop];
                return await Shopify_custom_session_storage.destroy({
                  where: {
                    shop: shop
                  }
                })
                .then(result => {
                  return true;
                })
                .catch(err => {
                  if(err) throw err;
                  return false;
                });
              }
            });

            if (!response.success) {
              console.log(
                `Failed to register APP_UNINSTALLED webhook: ${response.result}`
              );
            }

            // Redirect to app with shop parameter upon auth
            ctx.redirect(`/?shop=${shop}&host=${host}`);
          },
        })
      );
      
      const handleRequest = async (ctx) => {
        await handle(ctx.req, ctx.res);
        ctx.respond = false;
        ctx.res.statusCode = 200;
      };

      router.post("/webhooks", async (ctx) => {
        try {
          await Shopify.Webhooks.Registry.process(ctx.req, ctx.res);
          console.log(`Webhook processed, returned status code 200`);
        } catch (error) {
          console.log(`Failed to process webhook: ${error}`);
        }
      });

      router.post(
        "/graphql",
        verifyRequest({ returnHeader: true }),
        async (ctx, next) => {
          await Shopify.Utils.graphqlProxy(ctx.req, ctx.res);
        }
      );

      router.post("/api", async (ctx) => {
        const action = `${ctx.request.body.data.action}`;
        const { shop, accessToken } = ctx.session.userData;
        let client;
        let data;

        switch (action) {
          case "GraphQL":
             client = new Shopify.Clients.Graphql(shop, accessToken);
             data = await client.query({
              data: `{
                products(first: 250) {
                  edges {
                    node {
                      id
                      title
                      handle
                    }
                  }
                }
              }`,
            });

            ctx.res.statusCode = 200;
            ctx.body = {
              allProducts: data
            }
          break;

          case "RESTAPI":
            client = new Shopify.Clients.Rest(shop, accessToken);
            data = await client.get({
              path: 'products',
            });

            ctx.res.statusCode = 200;
            ctx.body = {
              allProducts: data
            }
          break;
        
          default:
            ctx.res.statusCode = 500;
            ctx.body = {
              error: "Invalid action"
            };
          break;
        }
      });

      router.get("(/_next/static/.*)", handleRequest); // Static content is clear
      router.get("/_next/webpack-hmr", handleRequest); // Webpack content is clear
      router.get("(.*)", async (ctx) => {
        try {
          const shop = ctx.query.shop;
          let user = await Shopify_custom_session_storage.findAll({
              raw: true,
              where:{
                shop: shop
              },
              limit:1
            });
          //This shop hasn't been seen yet, go through OAuth to create a sessrsion
          if (user.length == 0 || user[0].shop == undefined) {
            ctx.redirect(`/auth?shop=${shop}`);
          }

          if(ctx.session.userData == undefined){
            ctx.session.userData = {
              shop: user[0].shop,
              accessToken: user[0].accessToken
            };
          }else{
            ctx.session.userData = {
              shop: user[0].shop,
              accessToken: user[0].accessToken
            };
          }
          
          await handleRequest(ctx);

          // if (ACTIVE_SHOPIFY_SHOPS[shop] == undefined) {
          //   ctx.redirect(`/auth?shop=${shop}`);
          // } else {
          //   await handleRequest(ctx);
          // }
        } catch(err) {
          console.log(err);
          throw err;
        }
      });

      server.use(router.allowedMethods());
      server.use(router.routes());
      server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
      });
    });

  })
  .catch(err => {
    console.log(err);
    throw new Error(err);
  });