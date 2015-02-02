require('proof')(3, prove)

function prove (assert) {
    var cadence = require('../../minimal')

    var count = 0
    cadence(function (async) {
        async([function () {
            assert(count, 1, 'incremented')
        }], function () {
            count++
        })
    })(function (error) {
        if (error) throw error
    })

    var cleanup = 0
    cadence(function (async) {
        async([function () {
            cleanup++
            throw new Error('one')
        }], [function () {
            cleanup++
            throw new Error('two')
        }], function () {
            return 1
        })
    })(function (error) {
        assert(error.message, 'one', 'first finalizer error')
        assert(cleanup, 2, 'both finalizers called')
    })
}