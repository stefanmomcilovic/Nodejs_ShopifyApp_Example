import Shopify, { ApiVersion } from "@shopify/shopify-api";

let apiController = async (ctx) => {
    try{
        const action = `${ctx.request.body.data.action}`;
        const session = await Shopify.Utils.loadCurrentSession(ctx.req, ctx.res);
        let shop = session.shop;
        let accessToken = session.accessToken;
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

            ctx.status = 200;
            ctx.body = {
            allProducts: data
            }
        break;

        case "RESTAPI":
            client = new Shopify.Clients.Rest(shop, accessToken);
            data = await client.get({
            path: 'products',
            });

            ctx.status = 200;
            ctx.body = {
            allProducts: data
            }
        break;
        default:
            ctx.status = 400;
            ctx.body = "Invalid action!";
        break;
        }
    }catch(err){
        ctx.status = 400;
        ctx.body = "Something went wrong, please try again later!";
    }
};

module.exports = {
    apiController
};