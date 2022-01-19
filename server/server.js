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
import cookies from "koa-cookie";
import compress from "koa-compress";
import logger from "koa-logger";
import cors from "koa-cors";
import "isomorphic-fetch";
import { gql } from "apollo-boost";

import { storeCallback, loadCallback, deleteCallback } from "./custom-session";
import { createClient, getSubscriptionUrl } from "./handlers/index";
const sequelize = require("./database/database");
const { Shopify_custom_session_storage, Shopify_billings } = require("./../models/sequelizeModels");

import apiRouter from "./../routers/apiRouter";

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

      server.use(session({secure:true}, server));
      server.keys = [Shopify.Context.API_SECRET_KEY];

      server.use(
        createShopifyAuth({
          async afterAuth(ctx) {
            // Access token and shop available in ctx.state.shopify
            const { shop, accessToken } = ctx.state.shopify;
            const host = ctx.query.host;
            ctx.session.shop = shop;
            ctx.session.host = host;
            // Getting users data from database and saving it to variable //
              try {
                let user = await Shopify_custom_session_storage.findAll({
                    raw: true,
                    where:{
                      shop: shop
                    },
                    limit:1
                  });
       
                  // ACTIVE_SHOPIFY_SHOPS[shop] = scope;

                const response = await Shopify.Webhooks.Registry.register({
                  shop,
                  accessToken,
                  path: "/webhooks",
                  topic: "APP_UNINSTALLED",
                  webhookHandler: async (topic, shop, body) =>{
                    // return delete ACTIVE_SHOPIFY_SHOPS[shop];
                    let user = await Shopify_custom_session_storage.destroy({
                      where: {
                        shop: shop
                      }
                    });

                    let billing = await Shopify_billings.destroy({
                      where: {
                        shop: shop
                      }
                    });
                  }
                });

                if (!response.success) {
                  console.log(
                    `Failed to register APP_UNINSTALLED webhook: ${response.result}`
                  );
                }

                // Redirect to app with shop parameter upon auth
                server.context.client = await createClient(shop, accessToken);
                await getSubscriptionUrl(ctx);
                // ctx.redirect(`/?shop=${shop}&host=${host}`);

                if(user){
                  return true;
                }else{
                  return undefined;
                }
              } catch(err) {
                console.log(err);
                ctx.status = 500;
                ctx.body = "Something went wrong, please try again later!";
              }
            //  End of Getting users data from database and saving it to variable //
          },
        })
      );

      // Puting user data in state 
      // server.use(async (ctx, next) => {
      //   try{
      //     if(ctx.state.userData == null || ctx.state.userData == undefined){
      //       const referer  = ctx.request.header.referer;
      //       const urlParams = new URLSearchParams(referer);
      //       const shopData =  urlParams.get('shop');
      //       if(shopData != null && shopData != undefined){
      //         let user = await Shopify_custom_session_storage.findAll({
      //           raw: true,
      //           where:{
      //             shop: shopData
      //           },
      //           limit:1
      //         });

      //         if(user.length > 0){
      //           ctx.state.userData = {
      //             shop: shopData,
      //             accessToken: user[0].accessToken
      //           };
      //         }
      //       }
      //     }

      //     await next();
      //   }catch(err) {
      //     ctx.status = 500;
      //     ctx.body = "State is not available!";
      //   }
      // }); 
      
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

      router.use( apiRouter.routes() );
      router.use( apiRouter.allowedMethods() );

      router.post("/test", verifyRequest({ returnHeader: true }), async(ctx) => {
        const session = await Shopify.Utils.loadCurrentSession(ctx.req, ctx.res);
        console.log(session);
        ctx.status = 200;
        ctx.message = "Success!";
      });

      // Handling errors //
      server.use(async (ctx, next) => {
        try {
          await next();
        } catch (err) {
          ctx.status = err.statusCode || err.status || 500;
          ctx.body = err.message;
          ctx.app.emit('error', err, ctx);
        }
      });

      router.get("(/_next/static/.*)", handleRequest); // Static content is clear
      router.get("/_next/webpack-hmr", handleRequest); // Webpack content is clear
      router.get("(.*)", async function (ctx, next){
        try {
          if(ctx.query.charge_id != null && ctx.query.charge_id != undefined){
            let query = gql`
              query {
                node(id: "gid://shopify/AppSubscription/${ctx.query.charge_id}") {
                  ... on AppSubscription {
                    status
                    id
                    createdAt
                    returnUrl
                    trialDays
                  }
                }
              }
            `;

            let charge = await server.context.client.query({
              query: query
            });

            if(charge.data.node.status == "ACTIVE"){
              let billing_table_query =  await Shopify_billings.upsert({
                chargeId: ctx.query.charge_id,
                shop: ctx.session.shop,
                status: charge.data.node.status,
                gid: charge.data.node.id,
              });

              if(billing_table_query){
                ctx.redirect(`/?shop=${ctx.session.shop}&host=${ctx.session.host}`);
              }
            }else{
              ctx.status = 401;
              ctx.message = "You didn't subscribe to our app!";
            }
          }else{
            const shop = ctx.query.shop || ctx.session.shop;
            let user = await Shopify_custom_session_storage.findAll({
              raw: true,
              where:{
                shop: shop
              },
              limit:1
            });
            //This shop hasn't been seen yet, go through OAuth to create a sessrsion
            if ((user == null || undefined) || user.length == 0 || (user[0].shop == undefined || null)) {
              ctx.redirect(`/auth?shop=${shop}`);
            }else{
              // ctx.cookies.set("shop", user[0].shop, { httpOnly: true, secure: true, sameSite: "none"});
              // ctx.cookies.set("accessToken", user[0].accessToken, { httpOnly: true, secure: true, sameSite: "none" });
              await handleRequest(ctx);
            }
            // if (ACTIVE_SHOPIFY_SHOPS[shop] == undefined) {
            //   ctx.redirect(`/auth?shop=${shop}`);
            // } else {
            //   await handleRequest(ctx);
            // }
          }
        } catch(err) {
          console.log(err);
          ctx.status = 500;
          ctx.body = "Something went wrong, please try again later!";
        }
      });
      
      server.use(cors());
      server.use(async (ctx, next) => {
        if (ctx.path === '/webhooks') ctx.disableBodyParser = true;
        await next();
      });
      server.use(bodyParser());
      server.use(cookies());
      server.use(compress({
        filter (content_type) {
          return /text/i.test(content_type)
        },
        threshold: 2048,
        gzip: {
          flush: require('zlib').constants.Z_SYNC_FLUSH
        },
        deflate: {
          flush: require('zlib').constants.Z_SYNC_FLUSH,
        },
        br: false // disable brotli
      }));
      server.use(logger());
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
