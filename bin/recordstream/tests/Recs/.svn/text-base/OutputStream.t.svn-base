use Test::More qw(no_plan);
use IO::String;
use Data::Dumper;

my $base_dir = $ENV{'BASE_TEST_DIR'} . '/Recs';

BEGIN { use_ok( 'Recs::OutputStream' ) };

use IO::String;
use Recs::Record;
use Recs::InputStream;

my $hash = Recs::Record->new(
   'foo' => 'bar',
   'zoo' => {
      'blah' => 'biz',
      'far'  => [ 'fing', 'fang', 'foom' ],
   }
);

my $fh = IO::String->new();

ok(my $out = Recs::OutputStream->new($fh), 'Constructor test');
ok($out->put_record($hash), 'Put a record');

my $in = Recs::InputStream->new(STRING=> ${$fh->string_ref});
is_deeply($in->get_record(), $hash, 'got the same thing out as was put in');
